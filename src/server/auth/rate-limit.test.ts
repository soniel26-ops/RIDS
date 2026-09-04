import { describe, expect, it, vi } from "vitest";
import { AuthError } from "./auth.errors";
import {
  createRateLimiter,
  RATE_LIMIT_KEYS,
  TimeoutError,
  withTimeout,
  type RateLimitStore,
} from "./rate-limit";
import { createMemoryRateLimitStore } from "./testing/fakes";

function clock(start = Date.parse("2026-09-04T12:00:00Z")) {
  let current = start;
  return { now: () => new Date(current), advance: (ms: number) => (current += ms) };
}

describe("createRateLimiter (CA-18, CA-36)", () => {
  const KEY = RATE_LIMIT_KEYS.loginFail("ruben@exemplo.com");

  it("monta as chaves por e-mail normalizado", () => {
    expect(KEY).toBe("auth:login-fail:ruben@exemplo.com");
    expect(RATE_LIMIT_KEYS.resetRequest("a@b.co")).toBe("auth:reset-req:a@b.co");
  });

  it("bloqueia a partir da 5.ª falha e libera quando a janela expira", async () => {
    const { now, advance } = clock();
    const limiter = createRateLimiter(createMemoryRateLimitStore(now));
    for (let i = 1; i <= 4; i += 1) {
      expect(await limiter.hit(KEY)).toBe(i);
      expect(await limiter.isBlocked(KEY)).toBe(false);
    }
    await limiter.hit(KEY);
    expect(await limiter.isBlocked(KEY)).toBe(true);

    advance(15 * 60 * 1000 - 1);
    expect(await limiter.isBlocked(KEY)).toBe(true);
    advance(1);
    expect(await limiter.isBlocked(KEY)).toBe(false);
  });

  it("chama EXPIRE só no primeiro INCR (janela fixa desde a primeira falha)", async () => {
    const store = createMemoryRateLimitStore();
    const expire = vi.spyOn(store, "expire");
    const limiter = createRateLimiter(store);
    await limiter.hit(KEY);
    await limiter.hit(KEY);
    await limiter.hit(KEY);
    expect(expire).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledWith(KEY, 900);
  });

  it("reset zera a contagem", async () => {
    const limiter = createRateLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < 5; i += 1) await limiter.hit(KEY);
    expect(await limiter.isBlocked(KEY)).toBe(true);
    await limiter.reset(KEY);
    expect(await limiter.isBlocked(KEY)).toBe(false);
    expect(await limiter.hit(KEY)).toBe(1);
  });

  it("falha fechada com AUTH_UNAVAILABLE quando o Redis lança", async () => {
    const broken: RateLimitStore = {
      incr: async () => {
        throw new Error("ECONNREFUSED");
      },
      expire: async () => 1,
      get: async () => {
        throw new Error("ECONNREFUSED");
      },
      del: async () => 1,
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const limiter = createRateLimiter(broken);
    await expect(limiter.isBlocked(KEY)).rejects.toMatchObject({ code: "AUTH_UNAVAILABLE" });
    await expect(limiter.hit(KEY)).rejects.toBeInstanceOf(AuthError);
  });

  it("falha fechada quando o Redis não responde dentro do timeout", async () => {
    const hanging: RateLimitStore = {
      incr: () => new Promise(() => {}),
      expire: () => new Promise(() => {}),
      get: () => new Promise(() => {}),
      del: () => new Promise(() => {}),
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const limiter = createRateLimiter(hanging, { limit: 5, windowSeconds: 900, timeoutMs: 20 });
    await expect(limiter.isBlocked(KEY)).rejects.toMatchObject({ code: "AUTH_UNAVAILABLE" });
  });
});

describe("withTimeout", () => {
  it("devolve o valor quando resolve a tempo", async () => {
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
  });

  it("rejeita com TimeoutError quando demora", async () => {
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toBeInstanceOf(TimeoutError);
  });

  it("propaga a rejeição original", async () => {
    await expect(withTimeout(Promise.reject(new Error("x")), 50)).rejects.toThrow("x");
  });
});
