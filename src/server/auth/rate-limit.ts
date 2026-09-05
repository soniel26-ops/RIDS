/**
 * Limite de tentativas por e-mail em Redis (janela fixa). Chaves:
 *   auth:login-fail:<email>  — falhas de login e de "senha atual" (CA-18, CA-26)
 *   auth:reset-req:<email>   — pedidos de link de redefinição (CA-36)
 * INCR é atómico; EXPIRE só quando o INCR devolve 1 (janela a partir da primeira falha).
 * Redis fora do ar ou lento → falha fechada: AUTH_UNAVAILABLE (briefing, R-3).
 */
import { AuthError } from "./auth.errors";
import { REDIS_COMMAND_TIMEOUT_MS, withTimeout } from "./with-timeout";

export { TimeoutError, withTimeout } from "./with-timeout";

/** Subconjunto do ioredis usado aqui; um Map em memória serve nos testes. */
export interface RateLimitStore {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
}

export interface RateLimiter {
  /** true quando a contagem já atingiu o limite. */
  isBlocked(key: string): Promise<boolean>;
  /** Conta uma falha/pedido e devolve a contagem atual. */
  hit(key: string): Promise<number>;
  /** Zera a contagem. */
  reset(key: string): Promise<void>;
}

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
  timeoutMs: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  limit: 5,
  windowSeconds: 900,
  timeoutMs: REDIS_COMMAND_TIMEOUT_MS,
};

export const RATE_LIMIT_KEYS = {
  loginFail: (emailNorm: string) => `auth:login-fail:${emailNorm}`,
  resetRequest: (emailNorm: string) => `auth:reset-req:${emailNorm}`,
} as const;

export function createRateLimiter(
  store: RateLimitStore,
  options: RateLimitOptions = DEFAULT_RATE_LIMIT,
): RateLimiter {
  async function guarded<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await withTimeout(operation(), options.timeoutMs);
    } catch (error) {
      console.error("rate-limit indisponível", error instanceof Error ? error.message : error);
      throw new AuthError("AUTH_UNAVAILABLE");
    }
  }

  return {
    async isBlocked(key) {
      const raw = await guarded(() => store.get(key));
      const count = raw === null ? 0 : Number(raw);
      return Number.isFinite(count) && count >= options.limit;
    },
    async hit(key) {
      const count = await guarded(() => store.incr(key));
      if (count === 1) {
        await guarded(() => store.expire(key, options.windowSeconds));
      }
      return count;
    },
    async reset(key) {
      await guarded(() => store.del(key));
    },
  };
}
