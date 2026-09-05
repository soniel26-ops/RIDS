/**
 * Registro de auditoria de acesso (CA-39 a CA-43). `record` nunca lança: uma falha
 * ao gravar vai para o log só com a mensagem do erro, sem o conteúdo do evento.
 * Nunca recebe senha, token, cookie, IP ou user-agent: o tipo não tem campo para isso.
 */
export type AuditEvent = "LOGIN_SUCCEEDED" | "LOGIN_FAILED" | "PASSWORD_CHANGED" | "PASSWORD_RESET";
export type AuditFailureReason = "INVALID_CREDENTIALS" | "RATE_LIMITED";

export interface AuditEntry {
  event: AuditEvent;
  /** E-mail já normalizado. */
  email: string;
  userId?: string | null;
  /** Só em LOGIN_FAILED. */
  reason?: AuditFailureReason;
}

export interface AuditRow {
  event: AuditEvent;
  email: string;
  userId: string | null;
  reason: string | null;
  createdAt: Date;
}

/** Subconjunto do Prisma usado aqui. */
export interface AuditRepository {
  authAuditLog: {
    create(args: { data: AuditRow }): Promise<unknown>;
  };
}

export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
}

export function createAuditLog(db: AuditRepository, now: () => Date = () => new Date()): AuditLog {
  return {
    async record(entry) {
      try {
        await db.authAuditLog.create({
          data: {
            event: entry.event,
            email: entry.email,
            userId: entry.userId ?? null,
            reason: entry.event === "LOGIN_FAILED" ? (entry.reason ?? null) : null,
            createdAt: now(),
          },
        });
      } catch (error) {
        console.error("auditoria falhou", error instanceof Error ? error.message : String(error));
      }
    },
  };
}
