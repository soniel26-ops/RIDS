import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailAlreadyInUseError } from "./auth.errors";
import { createAuditLog } from "./audit";
import {
  createAuthService,
  FORGOT_MIN_RESPONSE_MS,
  RESET_TOKEN_TTL_MS,
  SESSION_TTL_MS,
  type AuthUserRow,
} from "./auth.service";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "./password";
import { createRateLimiter, RATE_LIMIT_KEYS } from "./rate-limit";
import {
  createFakeAuthDb,
  createFakeMailTransport,
  createMemoryRateLimitStore,
} from "./testing/fakes";
import { hashToken } from "./tokens";

const hoisted = vi.hoisted(() => ({
  verifySpy: undefined as unknown as ReturnType<
    typeof vi.fn<(p: string, h: string) => Promise<boolean>>
  >,
}));
vi.mock("./password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./password")>();
  // vi.fn(impl): restoreAllMocks volta à implementação real em vez de apagar o spy.
  hoisted.verifySpy = vi.fn(actual.verifyPassword);
  return {
    ...actual,
    verifyPassword: (password: string, stored: string) => hoisted.verifySpy(password, stored),
  };
});
const verifySpy = () => hoisted.verifySpy;

const EMAIL = "ruben@exemplo.com";
const PASSWORD = "senha-secreta-123";
const NEW_PASSWORD = "nova-senha-456";
const START = Date.parse("2026-09-04T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const DAY = 24 * HOUR;

let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

function setup(options: { users?: Partial<AuthUserRow>[] } = {}) {
  let current = START;
  const now = () => new Date(current);
  const advance = (ms: number) => {
    current += ms;
  };
  const users: AuthUserRow[] = (options.users ?? [{}]).map((u, i) => ({
    id: u.id ?? `u${i + 1}`,
    email: u.email ?? EMAIL,
    passwordHash: u.passwordHash ?? passwordHash,
    role: u.role ?? "OWNER",
  }));
  const db = createFakeAuthDb({ users });
  const store = createMemoryRateLimitStore(now);
  const rateLimiter = createRateLimiter(store);
  const mail = createFakeMailTransport();
  const sleep = vi.fn(async () => {});
  const service = createAuthService({
    db,
    rateLimiter,
    audit: createAuditLog(db, now),
    mail,
    now,
    sleep,
    env: { APP_HOST: "localhost:3000", NODE_ENV: "test" },
  });
  return { service, db, store, rateLimiter, mail, sleep, now, advance, users };
}

function extractToken(text: string): string {
  const match = /\/redefinir-senha\?token=([A-Za-z0-9_-]{43})/.exec(text);
  if (!match) throw new Error("link não encontrado no e-mail");
  return match[1];
}

beforeEach(() => {
  verifySpy().mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("login", () => {
  it("CA-2/CA-39: cria sessão de 7 dias, devolve o usuário sem hash e audita o sucesso", async () => {
    const { service, db, now } = setup();
    const result = await service.login({ email: EMAIL, password: PASSWORD });

    expect(result.user).toEqual({ id: "u1", email: EMAIL, role: "OWNER" });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.expiresAt.getTime()).toBe(now().getTime() + SESSION_TTL_MS);
    expect(db.state.sessions).toHaveLength(1);
    expect(db.state.sessions[0].tokenHash).toBe(hashToken(result.token));
    expect(JSON.stringify(db.state.sessions)).not.toContain(result.token);
    expect(db.state.audit).toEqual([
      { event: "LOGIN_SUCCEEDED", email: EMAIL, userId: "u1", reason: null, createdAt: now() },
    ]);
  });

  it("normaliza o e-mail (maiúsculas e espaços)", async () => {
    const { service } = setup();
    const result = await service.login({ email: "  Ruben@Exemplo.com ", password: PASSWORD });
    expect(result.user.email).toBe(EMAIL);
  });

  it("CA-7/CA-40: senha errada → INVALID_CREDENTIALS, conta a falha e audita com userId", async () => {
    const { service, db, store } = setup();
    await expect(service.login({ email: EMAIL, password: "errada" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      status: 401,
      message: "E-mail ou senha incorretos",
    });
    expect(await store.get(RATE_LIMIT_KEYS.loginFail(EMAIL))).toBe("1");
    expect(db.state.sessions).toHaveLength(0);
    expect(db.state.audit[0]).toMatchObject({
      event: "LOGIN_FAILED",
      email: EMAIL,
      userId: "u1",
      reason: "INVALID_CREDENTIALS",
    });
  });

  it("CA-8: e-mail desconhecido → mesma mensagem, verifica contra o hash de sacrifício, audita userId null", async () => {
    const { service, db } = setup();
    await expect(
      service.login({ email: "Ninguem@Exemplo.com", password: "x" }),
    ).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "E-mail ou senha incorretos",
    });
    expect(verifySpy()).toHaveBeenCalledWith("x", DUMMY_PASSWORD_HASH);
    expect(db.state.audit[0]).toMatchObject({
      event: "LOGIN_FAILED",
      email: "ninguem@exemplo.com",
      userId: null,
      reason: "INVALID_CREDENTIALS",
    });
  });

  it("CA-18: após 5 falhas, a 6.ª com senha certa → TOO_MANY_ATTEMPTS e audita RATE_LIMITED", async () => {
    const { service, db } = setup();
    for (let i = 0; i < 5; i += 1) {
      await expect(service.login({ email: EMAIL, password: "errada" })).rejects.toMatchObject({
        code: "INVALID_CREDENTIALS",
      });
    }
    await expect(service.login({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: "TOO_MANY_ATTEMPTS",
      status: 429,
      message: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
    });
    expect(verifySpy()).toHaveBeenCalledTimes(5);
    expect(db.state.audit).toHaveLength(6);
    expect(db.state.audit[5]).toMatchObject({
      event: "LOGIN_FAILED",
      reason: "RATE_LIMITED",
      userId: null,
    });
  });

  it("CA-18: o bloqueio termina 15 minutos depois da primeira falha", async () => {
    const { service, advance } = setup();
    for (let i = 0; i < 5; i += 1) {
      await service.login({ email: EMAIL, password: "errada" }).catch(() => {});
      advance(MINUTE);
    }
    await expect(service.login({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: "TOO_MANY_ATTEMPTS",
    });
    advance(10 * MINUTE);
    await expect(service.login({ email: EMAIL, password: PASSWORD })).resolves.toBeDefined();
  });

  it("caso extremo: após 4 falhas, um login correto entra e zera a contagem", async () => {
    const { service, store } = setup();
    for (let i = 0; i < 4; i += 1)
      await service.login({ email: EMAIL, password: "errada" }).catch(() => {});
    await expect(service.login({ email: EMAIL, password: PASSWORD })).resolves.toBeDefined();
    expect(await store.get(RATE_LIMIT_KEYS.loginFail(EMAIL))).toBeNull();
  });

  it("CA-13: banco fora → AUTH_UNAVAILABLE sem detalhe técnico", async () => {
    const { service, db } = setup();
    vi.spyOn(db.user, "findUnique").mockRejectedValue(
      new Error("connect ECONNREFUSED 127.0.0.1:5432"),
    );
    await expect(service.login({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: "AUTH_UNAVAILABLE",
      status: 503,
      message: "O serviço está indisponível de momento. Tente mais tarde.",
    });
  });

  it("R-3: Redis fora → AUTH_UNAVAILABLE (falha fechada)", async () => {
    const { service, store } = setup();
    vi.spyOn(store, "get").mockRejectedValue(new Error("redis down"));
    await expect(service.login({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: "AUTH_UNAVAILABLE",
    });
  });

  it("caso extremo: falha na auditoria não impede o login", async () => {
    const { service, db } = setup();
    vi.spyOn(db.authAuditLog, "create").mockRejectedValue(new Error("disk full"));
    await expect(service.login({ email: EMAIL, password: PASSWORD })).resolves.toMatchObject({
      user: { email: EMAIL },
    });
  });

  it("CA-43: a auditoria nunca contém a senha nem o token", async () => {
    const { service, db } = setup();
    await service.login({ email: EMAIL, password: "errada-123" }).catch(() => {});
    const ok = await service.login({ email: EMAIL, password: PASSWORD });
    const serialized = JSON.stringify(db.state.audit);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain("errada-123");
    expect(serialized).not.toContain(ok.token);
    expect(serialized).not.toContain(hashToken(ok.token));
  });
});

describe("resolveSession / logout", () => {
  it("CA-15: válida até +7d-1s; em +7d é null e a sessão é apagada", async () => {
    const { service, db, advance } = setup();
    const { token } = await service.login({ email: EMAIL, password: PASSWORD });
    advance(7 * DAY - 1000);
    expect(await service.resolveSession(token)).toEqual({ id: "u1", email: EMAIL, role: "OWNER" });
    advance(1000);
    expect(await service.resolveSession(token)).toBeNull();
    expect(db.state.sessions).toHaveLength(0);
  });

  it("CA-12: token adulterado, desconhecido ou ausente → null", async () => {
    const { service } = setup();
    expect(await service.resolveSession("lixo")).toBeNull();
    expect(await service.resolveSession("B".repeat(43))).toBeNull();
    expect(await service.resolveSession(undefined)).toBeNull();
  });

  it("banco fora → AUTH_UNAVAILABLE (não confunde com sessão expirada)", async () => {
    const { service, db } = setup();
    vi.spyOn(db.session, "findUnique").mockRejectedValue(new Error("down"));
    await expect(service.resolveSession("B".repeat(43))).rejects.toMatchObject({
      code: "AUTH_UNAVAILABLE",
    });
  });

  it("CA-5/CA-16: sair apaga só a sessão do cookie; sair duas vezes não dá erro", async () => {
    const { service, db } = setup();
    const a = await service.login({ email: EMAIL, password: PASSWORD });
    const b = await service.login({ email: EMAIL, password: PASSWORD });
    await service.logout(a.token);
    await service.logout(a.token);
    await service.logout("lixo");
    expect(db.state.sessions.map((s) => s.tokenHash)).toEqual([hashToken(b.token)]);
    expect(await service.resolveSession(b.token)).not.toBeNull();
  });
});

describe("changePassword", () => {
  it("CA-22/CA-37/CA-41: troca a senha, mantém as sessões, apaga links pendentes e audita", async () => {
    const { service, db, mail } = setup();
    const a = await service.login({ email: EMAIL, password: PASSWORD });
    await service.requestPasswordReset({ email: EMAIL });
    expect(db.state.resetTokens).toHaveLength(1);

    await service.changePassword({
      userId: "u1",
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(await verifyPassword(NEW_PASSWORD, db.state.users[0].passwordHash)).toBe(true);
    expect(db.state.sessions).toHaveLength(1);
    expect(await service.resolveSession(a.token)).not.toBeNull();
    expect(db.state.resetTokens).toHaveLength(0);
    expect(db.state.audit.at(-1)).toMatchObject({
      event: "PASSWORD_CHANGED",
      email: EMAIL,
      userId: "u1",
    });
    await expect(service.login({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    await expect(service.login({ email: EMAIL, password: NEW_PASSWORD })).resolves.toBeDefined();
    expect(mail.sent).toHaveLength(1);
  });

  it("CA-26: senha atual errada → INVALID_CURRENT_PASSWORD e conta na chave do login", async () => {
    const { service, db, store } = setup();
    await expect(
      service.changePassword({
        userId: "u1",
        currentPassword: "errada",
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CURRENT_PASSWORD",
      status: 400,
      message: "Senha atual incorreta",
    });
    expect(await store.get(RATE_LIMIT_KEYS.loginFail(EMAIL))).toBe("1");
    expect(db.state.users[0].passwordHash).toBe(passwordHash);
    expect(db.state.audit).toHaveLength(0);
  });

  it("CA-18: bloqueado pelo contador do login → TOO_MANY_ATTEMPTS", async () => {
    const { service } = setup();
    for (let i = 0; i < 5; i += 1)
      await service.login({ email: EMAIL, password: "errada" }).catch(() => {});
    await expect(
      service.changePassword({
        userId: "u1",
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
  });

  it("CA-20/CA-27: nova senha com 9 caracteres → VALIDATION_ERROR e a atual continua válida", async () => {
    const { service, db } = setup();
    await expect(
      service.changePassword({ userId: "u1", currentPassword: PASSWORD, newPassword: "123456789" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "A senha deve ter pelo menos 10 caracteres.",
    });
    expect(db.state.users[0].passwordHash).toBe(passwordHash);
    expect(verifySpy()).not.toHaveBeenCalled();
  });

  it("usuário inexistente → UNAUTHENTICATED", async () => {
    const { service } = setup();
    await expect(
      service.changePassword({
        userId: "nope",
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("requestPasswordReset", () => {
  it("CA-24: envia 1 e-mail com o link e guarda só o hash do token com 1 hora de validade", async () => {
    const { service, db, mail, now } = setup();
    await service.requestPasswordReset({ email: " Ruben@Exemplo.com " });

    expect(mail.pingCalls).toBe(1);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe(EMAIL);
    expect(mail.sent[0].subject).toBe("Redefinir a senha do RIDS");
    const token = extractToken(mail.sent[0].text);
    expect(mail.sent[0].text).toContain(`http://localhost:3000/redefinir-senha?token=${token}`);
    expect(db.state.resetTokens).toHaveLength(1);
    expect(db.state.resetTokens[0]).toMatchObject({
      userId: "u1",
      tokenHash: hashToken(token),
      usedAt: null,
      expiresAt: new Date(now().getTime() + RESET_TOKEN_TTL_MS),
    });
    expect(JSON.stringify(db.state)).not.toContain(token);
  });

  it("CA-28: e-mail desconhecido → sem envio, sem token, mas ping e espera iguais", async () => {
    const { service, db, mail, sleep } = setup();
    await expect(
      service.requestPasswordReset({ email: "ninguem@exemplo.com" }),
    ).resolves.toBeUndefined();
    expect(mail.pingCalls).toBe(1);
    expect(mail.sent).toHaveLength(0);
    expect(db.state.resetTokens).toHaveLength(0);
    expect(sleep).toHaveBeenCalledWith(FORGOT_MIN_RESPONSE_MS);
  });

  it("tempo equalizado: espera só o que falta para 800 ms", async () => {
    const { service, sleep, mail, advance } = setup();
    mail.send = async (message) => {
      mail.sent.push(message);
      advance(300);
    };
    await service.requestPasswordReset({ email: EMAIL });
    expect(sleep).toHaveBeenCalledWith(FORGOT_MIN_RESPONSE_MS - 300);
  });

  it("CA-35: um novo pedido apaga o token anterior antes de criar o novo", async () => {
    const { service, db, mail } = setup();
    const deleteMany = vi.spyOn(db.passwordResetToken, "deleteMany");
    const create = vi.spyOn(db.passwordResetToken, "create");
    await service.requestPasswordReset({ email: EMAIL });
    const first = extractToken(mail.sent[0].text);
    await service.requestPasswordReset({ email: EMAIL });
    const second = extractToken(mail.sent[1].text);

    expect(db.state.resetTokens).toHaveLength(1);
    expect(db.state.resetTokens[0].tokenHash).toBe(hashToken(second));
    expect(first).not.toBe(second);
    expect(deleteMany.mock.invocationCallOrder[1]).toBeLessThan(create.mock.invocationCallOrder[1]);
  });

  it("CA-30: serviço de e-mail fora (ping) → MAIL_UNAVAILABLE para existente e inexistente, sem token", async () => {
    const { service, db, mail } = setup();
    mail.failPing = true;
    for (const email of [EMAIL, "ninguem@exemplo.com"]) {
      await expect(service.requestPasswordReset({ email })).rejects.toMatchObject({
        code: "MAIL_UNAVAILABLE",
        status: 503,
        message: "Não foi possível enviar agora, tente mais tarde.",
      });
    }
    expect(db.state.resetTokens).toHaveLength(0);
  });

  it("CA-30: envio falha → MAIL_UNAVAILABLE e nenhum token fica válido", async () => {
    const { service, db, mail } = setup();
    mail.failSend = true;
    await expect(service.requestPasswordReset({ email: EMAIL })).rejects.toMatchObject({
      code: "MAIL_UNAVAILABLE",
    });
    expect(db.state.resetTokens).toHaveLength(0);
  });

  it("CA-36: 6.º pedido em 15 minutos → TOO_MANY_ATTEMPTS, também para e-mail inexistente", async () => {
    const { service, mail, advance } = setup();
    for (let i = 0; i < 5; i += 1) await service.requestPasswordReset({ email: EMAIL });
    await expect(service.requestPasswordReset({ email: EMAIL })).rejects.toMatchObject({
      code: "TOO_MANY_ATTEMPTS",
    });
    expect(mail.sent).toHaveLength(5);

    for (let i = 0; i < 5; i += 1)
      await service.requestPasswordReset({ email: "ninguem@exemplo.com" });
    await expect(
      service.requestPasswordReset({ email: "ninguem@exemplo.com" }),
    ).rejects.toMatchObject({
      code: "TOO_MANY_ATTEMPTS",
    });

    advance(15 * MINUTE);
    await expect(service.requestPasswordReset({ email: EMAIL })).resolves.toBeUndefined();
  });

  it("banco fora → AUTH_UNAVAILABLE", async () => {
    const { service, db } = setup();
    vi.spyOn(db.user, "findUnique").mockRejectedValue(new Error("down"));
    await expect(service.requestPasswordReset({ email: EMAIL })).rejects.toMatchObject({
      code: "AUTH_UNAVAILABLE",
    });
  });
});

describe("resetPassword", () => {
  async function requestToken(ctx: ReturnType<typeof setup>) {
    await ctx.service.requestPasswordReset({ email: EMAIL });
    return extractToken(ctx.mail.sent.at(-1)!.text);
  }

  it("CA-25/CA-38/CA-42: redefine, termina todas as sessões, zera o contador e audita", async () => {
    const ctx = setup();
    const { service, db, store } = ctx;
    await service.login({ email: EMAIL, password: PASSWORD });
    await service.login({ email: EMAIL, password: PASSWORD });
    await service.login({ email: EMAIL, password: "errada" }).catch(() => {});
    const token = await requestToken(ctx);
    const deleteSessions = vi.spyOn(db.session, "deleteMany");

    await service.resetPassword({ token, newPassword: NEW_PASSWORD });

    expect(deleteSessions).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(db.state.sessions).toHaveLength(0);
    expect(db.state.resetTokens).toHaveLength(0);
    expect(await store.get(RATE_LIMIT_KEYS.loginFail(EMAIL))).toBeNull();
    expect(db.state.audit.at(-1)).toMatchObject({
      event: "PASSWORD_RESET",
      email: EMAIL,
      userId: "u1",
    });
    await expect(service.login({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    await expect(service.login({ email: EMAIL, password: NEW_PASSWORD })).resolves.toBeDefined();
  });

  it("CA-34: aceita a 59m59s e recusa a 1h01s", async () => {
    const early = setup();
    const t1 = await requestToken(early);
    early.advance(HOUR - 1000);
    await expect(
      early.service.resetPassword({ token: t1, newPassword: NEW_PASSWORD }),
    ).resolves.toBeUndefined();

    const late = setup();
    const t2 = await requestToken(late);
    late.advance(HOUR + 1000);
    await expect(
      late.service.resetPassword({ token: t2, newPassword: NEW_PASSWORD }),
    ).rejects.toMatchObject({
      code: "INVALID_RESET_TOKEN",
      status: 400,
      message: "Este link é inválido ou expirou; peça um novo",
    });
    expect(late.db.state.users[0].passwordHash).toBe(passwordHash);
  });

  it("CA-34: o segundo uso do mesmo link é recusado", async () => {
    const ctx = setup();
    const token = await requestToken(ctx);
    await ctx.service.resetPassword({ token, newPassword: NEW_PASSWORD });
    await expect(
      ctx.service.resetPassword({ token, newPassword: "outra-senha-789" }),
    ).rejects.toMatchObject({
      code: "INVALID_RESET_TOKEN",
    });
    expect(await verifyPassword(NEW_PASSWORD, ctx.db.state.users[0].passwordHash)).toBe(true);
  });

  it("CA-29/CA-35: link substituído, adulterado ou malformado é recusado e as sessões ficam intactas", async () => {
    const ctx = setup();
    const { service, db } = ctx;
    const session = await service.login({ email: EMAIL, password: PASSWORD });
    const first = await requestToken(ctx);
    const second = await requestToken(ctx);

    await expect(
      service.resetPassword({ token: first, newPassword: NEW_PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
    const tampered = second.slice(0, -1) + (second.endsWith("A") ? "B" : "A");
    await expect(
      service.resetPassword({ token: tampered, newPassword: NEW_PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
    await expect(
      service.resetPassword({ token: "curto", newPassword: NEW_PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });

    expect(db.state.sessions).toHaveLength(1);
    expect(await service.resolveSession(session.token)).not.toBeNull();
    expect(db.state.users[0].passwordHash).toBe(passwordHash);
    expect(db.state.audit.some((a) => a.event === "PASSWORD_RESET")).toBe(false);

    await expect(
      service.resetPassword({ token: second, newPassword: NEW_PASSWORD }),
    ).resolves.toBeUndefined();
  });

  it("CA-27: nova senha curta → VALIDATION_ERROR sem consumir o link", async () => {
    const ctx = setup();
    const token = await requestToken(ctx);
    await expect(
      ctx.service.resetPassword({ token, newPassword: "123456789" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "A senha deve ter pelo menos 10 caracteres.",
    });
    expect(ctx.db.state.resetTokens[0].usedAt).toBeNull();
    await expect(
      ctx.service.resetPassword({ token, newPassword: NEW_PASSWORD }),
    ).resolves.toBeUndefined();
  });

  it("caso extremo: dois navegadores — quem não conseguir marcar usedAt perde", async () => {
    const ctx = setup();
    const token = await requestToken(ctx);
    vi.spyOn(ctx.db.passwordResetToken, "updateMany").mockResolvedValue({ count: 0 });
    await expect(
      ctx.service.resetPassword({ token, newPassword: NEW_PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
    expect(ctx.db.state.users[0].passwordHash).toBe(passwordHash);
  });

  it("banco fora → AUTH_UNAVAILABLE", async () => {
    const ctx = setup();
    const token = await requestToken(ctx);
    vi.spyOn(ctx.db, "$transaction").mockRejectedValue(new Error("down"));
    await expect(
      ctx.service.resetPassword({ token, newPassword: NEW_PASSWORD }),
    ).rejects.toMatchObject({ code: "AUTH_UNAVAILABLE" });
  });
});

describe("createUser (CA-14, CA-20, CA-31)", () => {
  it("cria com e-mail normalizado e cargo explícito, sem devolver o hash", async () => {
    const { service, db } = setup({ users: [] });
    const user = await service.createUser({
      email: " Dono@Exemplo.com ",
      role: "OWNER",
      password: "1234567890",
    });
    expect(user).toEqual({ id: expect.any(String), email: "dono@exemplo.com", role: "OWNER" });
    expect(db.state.users[0].passwordHash).not.toContain("1234567890");
    expect(await verifyPassword("1234567890", db.state.users[0].passwordHash)).toBe(true);
  });

  it("recusa e-mail duplicado, mesmo com outra grafia", async () => {
    const { service } = setup();
    await expect(
      service.createUser({ email: "RUBEN@exemplo.com ", role: "ADMIN", password: "1234567890" }),
    ).rejects.toBeInstanceOf(EmailAlreadyInUseError);
  });

  it("recusa 9 caracteres, aceita 10 (espaços contam)", async () => {
    const { service } = setup({ users: [] });
    await expect(
      service.createUser({ email: "a@b.co", role: "OWNER", password: "123456789" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "A senha deve ter pelo menos 10 caracteres.",
    });
    await expect(
      service.createUser({ email: "a@b.co", role: "OWNER", password: "12345     " }),
    ).resolves.toBeDefined();
  });

  it("recusa cargo fora da lista e e-mail inválido", async () => {
    const { service } = setup({ users: [] });
    await expect(
      service.createUser({ email: "a@b.co", role: "X", password: "1234567890" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(
      service.createUser({ email: "nao-email", role: "OWNER", password: "1234567890" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "E-mail inválido.",
    });
  });
});

describe("upsertTestUser (rota de desenvolvimento)", () => {
  it("cria quando não existe", async () => {
    const { service, db } = setup({ users: [] });
    const user = await service.upsertTestUser({
      email: "T@Exemplo.com",
      password: "1234567890",
      role: "MARKETING",
    });
    expect(user).toMatchObject({ email: "t@exemplo.com", role: "MARKETING" });
    expect(db.state.users).toHaveLength(1);
  });

  it("repõe hash e cargo, apaga sessões e tokens e zera os contadores", async () => {
    const ctx = setup();
    const { service, db, store } = ctx;
    await service.login({ email: EMAIL, password: PASSWORD });
    await service.login({ email: EMAIL, password: "errada" }).catch(() => {});
    await service.requestPasswordReset({ email: EMAIL });

    const user = await service.upsertTestUser({
      email: EMAIL,
      password: NEW_PASSWORD,
      role: "ADMIN",
    });
    expect(user).toEqual({ id: "u1", email: EMAIL, role: "ADMIN" });
    expect(db.state.sessions).toHaveLength(0);
    expect(db.state.resetTokens).toHaveLength(0);
    expect(await store.get(RATE_LIMIT_KEYS.loginFail(EMAIL))).toBeNull();
    expect(await store.get(RATE_LIMIT_KEYS.resetRequest(EMAIL))).toBeNull();
    await expect(service.login({ email: EMAIL, password: NEW_PASSWORD })).resolves.toBeDefined();
  });

  it("recusa cargo inválido e senha curta", async () => {
    const { service } = setup({ users: [] });
    await expect(
      service.upsertTestUser({ email: "a@b.co", password: "1234567890", role: "X" as never }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.upsertTestUser({ email: "a@b.co", password: "curta", role: "OWNER" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});
