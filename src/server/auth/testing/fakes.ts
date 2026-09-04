/**
 * Dublês em memória para os testes unitários do domínio de auth (sem banco, sem Redis).
 * Não importam vitest: os testes espiam os métodos com vi.spyOn quando precisam.
 */
import type { AuditRepository, AuditRow } from "../audit";
import type {
  AuthModels,
  AuthRepository,
  AuthUserRow,
  PasswordResetTokenRow,
  SessionRow,
} from "../auth.service";
import type { MailMessage, MailTransport } from "../mail/transport";
import type { RateLimitStore } from "../rate-limit";

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

// ----- Redis falso ----------------------------------------------------------------

export interface MemoryRateLimitStore extends RateLimitStore {
  /** Estado interno para asserções. */
  entries: Map<string, { value: number; expiresAt: number | null }>;
}

export function createMemoryRateLimitStore(
  now: () => Date = () => new Date(),
): MemoryRateLimitStore {
  const entries = new Map<string, { value: number; expiresAt: number | null }>();
  function live(key: string) {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= now().getTime()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }
  return {
    entries,
    async incr(key) {
      const entry = live(key) ?? { value: 0, expiresAt: null };
      entry.value += 1;
      entries.set(key, entry);
      return entry.value;
    },
    async expire(key, seconds) {
      const entry = live(key);
      if (!entry) return 0;
      entry.expiresAt = now().getTime() + seconds * 1000;
      return 1;
    },
    async get(key) {
      const entry = live(key);
      return entry ? String(entry.value) : null;
    },
    async del(key) {
      return entries.delete(key) ? 1 : 0;
    },
  };
}

// ----- Transporte de e-mail falso ---------------------------------------------------

export interface FakeMailTransport extends MailTransport {
  sent: MailMessage[];
  failPing: boolean;
  failSend: boolean;
  pingCalls: number;
}

export function createFakeMailTransport(): FakeMailTransport {
  const transport: FakeMailTransport = {
    sent: [],
    failPing: false,
    failSend: false,
    pingCalls: 0,
    async ping() {
      transport.pingCalls += 1;
      if (transport.failPing) throw new Error("resend indisponível (simulado)");
    },
    async send(message) {
      if (transport.failSend) throw new Error("envio falhou (simulado)");
      transport.sent.push(message);
    },
  };
  return transport;
}

// ----- Repositório falso (Prisma) ----------------------------------------------------

export interface FakeAuthDb extends AuthRepository, AuditRepository {
  state: {
    users: AuthUserRow[];
    sessions: SessionRow[];
    resetTokens: PasswordResetTokenRow[];
    audit: AuditRow[];
  };
}

export function createFakeAuthDb(seed: { users?: AuthUserRow[] } = {}): FakeAuthDb {
  const state: FakeAuthDb["state"] = {
    users: [...(seed.users ?? [])],
    sessions: [],
    resetTokens: [],
    audit: [],
  };

  const findUser = (where: { email: string } | { id: string }) =>
    state.users.find((u) => ("email" in where ? u.email === where.email : u.id === where.id)) ??
    null;

  const models: AuthModels = {
    user: {
      async findUnique({ where }) {
        return findUser(where);
      },
      async create({ data }) {
        if (state.users.some((u) => u.email === data.email)) {
          throw new Error("Unique constraint failed on the fields: (`email`)");
        }
        const row: AuthUserRow = { id: nextId("user"), ...data };
        state.users.push(row);
        return row;
      },
      async update({ where, data }) {
        const user = findUser(where);
        if (!user) throw new Error("Record to update not found.");
        user.passwordHash = data.passwordHash;
        if (data.role) user.role = data.role;
        return user;
      },
    },
    session: {
      async create({ data }) {
        const row: SessionRow = { id: nextId("sess"), ...data };
        state.sessions.push(row);
        return row;
      },
      async findUnique({ where }) {
        const session = state.sessions.find((s) => s.tokenHash === where.tokenHash);
        if (!session) return null;
        const user = findUser({ id: session.userId });
        if (!user) return null;
        return { ...session, user };
      },
      async deleteMany({ where }) {
        const before = state.sessions.length;
        state.sessions = state.sessions.filter((s) =>
          "tokenHash" in where ? s.tokenHash !== where.tokenHash : s.userId !== where.userId,
        );
        return { count: before - state.sessions.length };
      },
    },
    passwordResetToken: {
      async findUnique({ where }) {
        const record = state.resetTokens.find((t) => t.tokenHash === where.tokenHash);
        if (!record) return null;
        const user = findUser({ id: record.userId });
        if (!user) return null;
        return { ...record, user };
      },
      async create({ data }) {
        const row: PasswordResetTokenRow = { id: nextId("prt"), usedAt: null, ...data };
        state.resetTokens.push(row);
        return row;
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const record of state.resetTokens) {
          if (record.id === where.id && record.usedAt === null) {
            record.usedAt = data.usedAt;
            count += 1;
          }
        }
        return { count };
      },
      async deleteMany({ where }) {
        const before = state.resetTokens.length;
        state.resetTokens = state.resetTokens.filter((t) => t.userId !== where.userId);
        return { count: before - state.resetTokens.length };
      },
    },
  };

  const db: FakeAuthDb = {
    state,
    ...models,
    async $transaction(fn) {
      return fn(models);
    },
    authAuditLog: {
      async create({ data }) {
        state.audit.push({ ...data });
        return data;
      },
    },
  };
  return db;
}
