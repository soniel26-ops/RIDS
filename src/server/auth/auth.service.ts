/**
 * Serviço de autenticação do painel. Único módulo que lê User, Session e
 * PasswordResetToken. Recebe as dependências por parâmetro (banco, limite de
 * tentativas, auditoria, e-mail, relógio) para ser testável sem infraestrutura.
 *
 * Invariantes:
 * - passwordHash e tokenHash nunca saem daqui; a UI só recebe CurrentUser.
 * - Toda falha prevista é uma AuthError; qualquer outra vira AUTH_UNAVAILABLE.
 * - Datas são instantes UTC vindos de `now()`; nada aqui usa Store.timezone.
 */
import type { CurrentUser, UserRole } from "@/shared/types";
import { AuthError, EmailAlreadyInUseError, isAuthError } from "./auth.errors";
import type { AuditLog } from "./audit";
import { buildResetEmail, buildResetUrl } from "./mail/reset-email";
import type { MailTransport } from "./mail/transport";
import { normalizeEmail } from "./normalize";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "./password";
import { RATE_LIMIT_KEYS, type RateLimiter } from "./rate-limit";
import {
  createUserSchema,
  emailField,
  firstIssueMessage,
  newPasswordField,
  roleSchema,
} from "./schemas";
import { generateOpaqueToken, hashToken, isTokenFormat } from "./tokens";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
/** Tempo mínimo de resposta de "esqueci a senha", igual para e-mail existente ou não (CA-28). */
export const FORGOT_MIN_RESPONSE_MS = 800;

// ----- Subconjunto do Prisma usado pelo serviço -----------------------------

export interface AuthUserRow {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}

export interface SessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface PasswordResetTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface AuthModels {
  user: {
    findUnique(args: { where: { email: string } | { id: string } }): Promise<AuthUserRow | null>;
    create(args: {
      data: { email: string; passwordHash: string; role: UserRole };
    }): Promise<AuthUserRow>;
    update(args: {
      where: { id: string };
      data: { passwordHash: string; role?: UserRole };
    }): Promise<unknown>;
  };
  session: {
    create(args: {
      data: { userId: string; tokenHash: string; expiresAt: Date };
    }): Promise<unknown>;
    findUnique(args: {
      where: { tokenHash: string };
      include: { user: true };
    }): Promise<(SessionRow & { user: AuthUserRow }) | null>;
    deleteMany(args: {
      where: { tokenHash: string } | { userId: string };
    }): Promise<{ count: number }>;
  };
  passwordResetToken: {
    findUnique(args: {
      where: { tokenHash: string };
      include: { user: true };
    }): Promise<(PasswordResetTokenRow & { user: AuthUserRow }) | null>;
    create(args: {
      data: { userId: string; tokenHash: string; expiresAt: Date };
    }): Promise<unknown>;
    updateMany(args: {
      where: { id: string; usedAt: null };
      data: { usedAt: Date };
    }): Promise<{ count: number }>;
    deleteMany(args: { where: { userId: string } }): Promise<{ count: number }>;
  };
}

export interface AuthRepository extends AuthModels {
  $transaction<T>(fn: (tx: AuthModels) => Promise<T>): Promise<T>;
}

export interface AuthServiceDeps {
  db: AuthRepository;
  rateLimiter: RateLimiter;
  audit: AuditLog;
  mail: MailTransport;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  env?: NodeJS.ProcessEnv;
}

export interface LoginResult {
  user: CurrentUser;
  token: string;
  expiresAt: Date;
}

// ----- Serviço ------------------------------------------------------------------

function toCurrentUser(row: AuthUserRow): CurrentUser {
  return { id: row.id, email: row.email, role: row.role };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Erros imprevistos (banco, rede) viram AUTH_UNAVAILABLE; só a mensagem vai para o log. */
function toUnavailable(context: string, error: unknown): AuthError {
  if (isAuthError(error)) return error;
  console.error(`${context} falhou`, error instanceof Error ? error.message : String(error));
  return new AuthError("AUTH_UNAVAILABLE");
}

function requireNewPassword(password: string): void {
  const parsed = newPasswordField.safeParse(password);
  if (!parsed.success) throw new AuthError("VALIDATION_ERROR", firstIssueMessage(parsed.error));
}

export function createAuthService(deps: AuthServiceDeps) {
  const { db, rateLimiter, audit, mail } = deps;
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? defaultSleep;
  const env = deps.env ?? process.env;

  async function findUserByEmail(emailNorm: string): Promise<AuthUserRow | null> {
    return db.user.findUnique({ where: { email: emailNorm } });
  }

  return {
    /** 3.2 do briefing. */
    async login(input: { email: string; password: string }): Promise<LoginResult> {
      const emailNorm = normalizeEmail(input.email);
      const key = RATE_LIMIT_KEYS.loginFail(emailNorm);
      try {
        if (await rateLimiter.isBlocked(key)) {
          await audit.record({ event: "LOGIN_FAILED", email: emailNorm, reason: "RATE_LIMITED" });
          throw new AuthError("TOO_MANY_ATTEMPTS");
        }

        const user = await findUserByEmail(emailNorm);
        // Sem conta, verifica contra um hash de sacrifício: tempo equivalente (CA-8).
        const valid = await verifyPassword(
          input.password,
          user?.passwordHash ?? DUMMY_PASSWORD_HASH,
        );
        if (!user || !valid) {
          await rateLimiter.hit(key);
          await audit.record({
            event: "LOGIN_FAILED",
            email: emailNorm,
            userId: user?.id ?? null,
            reason: "INVALID_CREDENTIALS",
          });
          throw new AuthError("INVALID_CREDENTIALS");
        }

        await rateLimiter.reset(key);
        const token = generateOpaqueToken();
        const expiresAt = new Date(now().getTime() + SESSION_TTL_MS);
        await db.session.create({
          data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
        });
        await audit.record({ event: "LOGIN_SUCCEEDED", email: user.email, userId: user.id });
        return { user: toCurrentUser(user), token, expiresAt };
      } catch (error) {
        throw toUnavailable("login", error);
      }
    },

    /** 3.4: idempotente; 0 ou 1 linha apagada, sem erro. */
    async logout(token: string | undefined | null): Promise<void> {
      if (!isTokenFormat(token)) return;
      try {
        await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
      } catch (error) {
        throw toUnavailable("logout", error);
      }
    },

    /**
     * Sessão válida → usuário; ausente, inválida ou expirada → null (a expirada é apagada).
     * Não usa Redis. Banco fora → AUTH_UNAVAILABLE.
     */
    async resolveSession(token: string | undefined | null): Promise<CurrentUser | null> {
      if (!isTokenFormat(token)) return null;
      try {
        const tokenHash = hashToken(token);
        const session = await db.session.findUnique({
          where: { tokenHash },
          include: { user: true },
        });
        if (!session) return null;
        if (session.expiresAt.getTime() <= now().getTime()) {
          await db.session.deleteMany({ where: { tokenHash } });
          return null;
        }
        return toCurrentUser(session.user);
      } catch (error) {
        throw toUnavailable("resolveSession", error);
      }
    },

    /** 3.5: partilha o contador do login (CA-26); não toca em Session (CA-37). */
    async changePassword(input: {
      userId: string;
      currentPassword: string;
      newPassword: string;
    }): Promise<void> {
      requireNewPassword(input.newPassword);
      try {
        const user = await db.user.findUnique({ where: { id: input.userId } });
        if (!user) throw new AuthError("UNAUTHENTICATED");
        const key = RATE_LIMIT_KEYS.loginFail(user.email);
        if (await rateLimiter.isBlocked(key)) throw new AuthError("TOO_MANY_ATTEMPTS");

        const valid = await verifyPassword(input.currentPassword, user.passwordHash);
        if (!valid) {
          await rateLimiter.hit(key);
          throw new AuthError("INVALID_CURRENT_PASSWORD");
        }

        await rateLimiter.reset(key);
        const passwordHash = await hashPassword(input.newPassword);
        await db.user.update({ where: { id: user.id }, data: { passwordHash } });
        await db.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await audit.record({ event: "PASSWORD_CHANGED", email: user.email, userId: user.id });
      } catch (error) {
        throw toUnavailable("changePassword", error);
      }
    },

    /** 3.6: resposta neutra e tempo equalizado (CA-24, CA-28, CA-30, CA-36). */
    async requestPasswordReset(input: { email: string }): Promise<void> {
      const emailNorm = normalizeEmail(input.email);
      const key = RATE_LIMIT_KEYS.resetRequest(emailNorm);
      try {
        if (await rateLimiter.isBlocked(key)) throw new AuthError("TOO_MANY_ATTEMPTS");
        await rateLimiter.hit(key);

        const startedAt = now().getTime();
        try {
          await mail.ping();
        } catch (error) {
          console.error(
            "e-mail: verificação falhou",
            error instanceof Error ? error.message : error,
          );
          throw new AuthError("MAIL_UNAVAILABLE");
        }

        const user = await findUserByEmail(emailNorm);
        if (user) {
          const token = generateOpaqueToken();
          const message = buildResetEmail({ to: user.email, resetUrl: buildResetUrl(token, env) });
          try {
            await mail.send(message);
          } catch (error) {
            console.error("e-mail: envio falhou", error instanceof Error ? error.message : error);
            throw new AuthError("MAIL_UNAVAILABLE");
          }
          const expiresAt = new Date(now().getTime() + RESET_TOKEN_TTL_MS);
          await db.$transaction(async (tx) => {
            await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
            await tx.passwordResetToken.create({
              data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
            });
          });
        }

        const elapsed = now().getTime() - startedAt;
        if (elapsed < FORGOT_MIN_RESPONSE_MS) await sleep(FORGOT_MIN_RESPONSE_MS - elapsed);
      } catch (error) {
        throw toUnavailable("requestPasswordReset", error);
      }
    },

    /** 3.7: uso único ("o primeiro ganha"), revoga todas as sessões (CA-38). */
    async resetPassword(input: { token: string; newPassword: string }): Promise<void> {
      if (!isTokenFormat(input.token)) throw new AuthError("INVALID_RESET_TOKEN");
      requireNewPassword(input.newPassword);
      const tokenHash = hashToken(input.token);
      let user: AuthUserRow;
      try {
        const passwordHash = await hashPassword(input.newPassword);
        user = await db.$transaction(async (tx) => {
          const record = await tx.passwordResetToken.findUnique({
            where: { tokenHash },
            include: { user: true },
          });
          if (!record || record.usedAt !== null || record.expiresAt.getTime() <= now().getTime()) {
            throw new AuthError("INVALID_RESET_TOKEN");
          }
          const claimed = await tx.passwordResetToken.updateMany({
            where: { id: record.id, usedAt: null },
            data: { usedAt: now() },
          });
          if (claimed.count !== 1) throw new AuthError("INVALID_RESET_TOKEN");

          await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
          await tx.session.deleteMany({ where: { userId: record.userId } });
          await tx.passwordResetToken.deleteMany({ where: { userId: record.userId } });
          return record.user;
        });
      } catch (error) {
        throw toUnavailable("resetPassword", error);
      }

      await audit.record({ event: "PASSWORD_RESET", email: user.email, userId: user.id });
      // A senha já mudou; zerar o contador é melhor esforço (Redis fora não desfaz a redefinição).
      try {
        await rateLimiter.reset(RATE_LIMIT_KEYS.loginFail(user.email));
      } catch (error) {
        console.error(
          "resetPassword: zerar contador falhou",
          error instanceof Error ? error.message : error,
        );
      }
    },

    /** 3.8: criação de conta pelo script. E-mail duplicado → EmailAlreadyInUseError. */
    async createUser(input: {
      email: string;
      role: string;
      password: string;
    }): Promise<CurrentUser> {
      const parsed = createUserSchema.safeParse(input);
      if (!parsed.success) throw new AuthError("VALIDATION_ERROR", firstIssueMessage(parsed.error));
      const emailNorm = normalizeEmail(parsed.data.email);
      try {
        const existing = await findUserByEmail(emailNorm);
        if (existing) throw new EmailAlreadyInUseError();
        const passwordHash = await hashPassword(parsed.data.password);
        const created = await db.user.create({
          data: { email: emailNorm, passwordHash, role: parsed.data.role },
        });
        return toCurrentUser(created);
      } catch (error) {
        if (error instanceof EmailAlreadyInUseError) throw error;
        throw toUnavailable("createUser", error);
      }
    },

    /**
     * 4.7: cria ou repõe um usuário de teste (só rotas de desenvolvimento). Se já existir,
     * atualiza hash e cargo e apaga sessões e tokens; em ambos os casos zera os contadores.
     */
    async upsertTestUser(input: {
      email: string;
      password: string;
      role: UserRole;
    }): Promise<CurrentUser> {
      const email = emailField.safeParse(input.email);
      const role = roleSchema.safeParse(input.role);
      if (!email.success) throw new AuthError("VALIDATION_ERROR", firstIssueMessage(email.error));
      if (!role.success) throw new AuthError("VALIDATION_ERROR", "Cargo inválido.");
      requireNewPassword(input.password);
      const emailNorm = normalizeEmail(email.data);
      try {
        const passwordHash = await hashPassword(input.password);
        const existing = await findUserByEmail(emailNorm);
        let user: AuthUserRow;
        if (existing) {
          await db.user.update({
            where: { id: existing.id },
            data: { passwordHash, role: role.data },
          });
          await db.session.deleteMany({ where: { userId: existing.id } });
          await db.passwordResetToken.deleteMany({ where: { userId: existing.id } });
          user = { ...existing, passwordHash, role: role.data };
        } else {
          user = await db.user.create({
            data: { email: emailNorm, passwordHash, role: role.data },
          });
        }
        await rateLimiter.reset(RATE_LIMIT_KEYS.loginFail(emailNorm));
        await rateLimiter.reset(RATE_LIMIT_KEYS.resetRequest(emailNorm));
        return toCurrentUser(user);
      } catch (error) {
        throw toUnavailable("upsertTestUser", error);
      }
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
