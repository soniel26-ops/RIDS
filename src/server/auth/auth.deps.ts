/**
 * Composição do serviço de autenticação com as dependências reais do processo:
 * Prisma, Redis (limite de tentativas e outbox de desenvolvimento) e transporte de e-mail.
 * Singleton do processo. As chamadas ao Redis são adiadas até ao primeiro comando, para
 * quem só cria contas (CLI) ou só lê sessões nunca abrir a conexão.
 */
import { prisma } from "@/server/db";
import { getRedisConnection } from "@/server/jobs/queue";
import { createAuditLog } from "./audit";
import { createAuthService, type AuthRepository, type AuthService } from "./auth.service";
import { getMailTransport } from "./mail/transport";
import { createRateLimiter, type RateLimitStore } from "./rate-limit";

const lazyRedisStore: RateLimitStore = {
  incr: (key) => getRedisConnection().incr(key),
  expire: (key, seconds) => getRedisConnection().expire(key, seconds),
  get: (key) => getRedisConnection().get(key),
  del: (key) => getRedisConnection().del(key),
};

/** Transporte resolvido no primeiro uso, para a configuração faltar só quando é precisa. */
const lazyMailTransport = {
  send: (message: Parameters<ReturnType<typeof getMailTransport>["send"]>[0]) =>
    getMailTransport().send(message),
  ping: () => getMailTransport().ping(),
};

let service: AuthService | undefined;

export function getAuthService(): AuthService {
  if (service) return service;
  const db: AuthRepository = prisma;
  service = createAuthService({
    db,
    rateLimiter: createRateLimiter(lazyRedisStore),
    audit: createAuditLog(prisma),
    mail: lazyMailTransport,
  });
  return service;
}
