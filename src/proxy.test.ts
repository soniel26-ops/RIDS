import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, isPublicPath, proxy, PUBLIC_PATHS } from "./proxy";

const BASE = "http://localhost:3000";

function request(path: string, cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return new NextRequest(`${BASE}${path}`, { headers });
}

afterEach(() => vi.unstubAllEnvs());

describe("matcher", () => {
  it("cobre páginas e /api/*", () => {
    for (const url of ["/", "/conta/senha", "/api/stores", "/api/health", "/login"]) {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
    }
  });

  it("exclui _next/static, _next/image, favicon.ico e arquivos com extensão", () => {
    for (const url of [
      "/_next/static/chunks/a.js",
      "/_next/image?url=x",
      "/favicon.ico",
      "/logo.png",
      "/x/y.css",
    ]) {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
    }
  });
});

describe("isPublicPath", () => {
  it("lista os caminhos públicos do briefing", () => {
    expect([...PUBLIC_PATHS]).toEqual([
      "/login",
      "/esqueci-senha",
      "/redefinir-senha",
      "/api/health",
      "/api/auth/login",
      "/api/auth/logout",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
    ]);
    expect(isPublicPath("/api/auth/change-password")).toBe(false);
    expect(isPublicPath("/api/stores")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
  });

  it("/api/dev/* é público só fora de produção", () => {
    expect(isPublicPath("/api/dev/outbox", { NODE_ENV: "test" })).toBe(true);
    expect(isPublicPath("/api/dev/test-user", { NODE_ENV: "development" })).toBe(true);
    expect(isPublicPath("/api/dev/outbox", { NODE_ENV: "production" })).toBe(false);
  });
});

describe("proxy (CA-1, CA-10, CA-17)", () => {
  it("sem cookie, página protegida → 307 para /login?next=<caminho>", () => {
    const response = proxy(request("/"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${BASE}/login?next=%2F`);
    const deep = proxy(request("/conta/senha?x=1"));
    expect(deep.headers.get("location")).toBe(`${BASE}/login?next=%2Fconta%2Fsenha%3Fx%3D1`);
  });

  it("sem cookie, /api/* → 401 UNAUTHENTICATED em JSON, sem dados", async () => {
    const response = proxy(request("/api/stores"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: "UNAUTHENTICATED", message: "Sessão necessária." },
    });
  });

  it("com cookie rids_session segue sem validar", () => {
    const response = proxy(request("/api/stores", "rids_session=qualquer"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(proxy(request("/", "rids_session=qualquer")).headers.get("x-middleware-next")).toBe("1");
  });

  it("caminhos públicos seguem sem cookie", () => {
    for (const path of [
      "/login",
      "/esqueci-senha",
      "/redefinir-senha?token=abc",
      "/api/health",
      "/api/auth/login",
      "/api/auth/logout",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
    ]) {
      expect(proxy(request(path)).headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("/api/dev/* passa fora de produção e é bloqueado em produção", () => {
    expect(proxy(request("/api/dev/outbox?to=a@b.co")).headers.get("x-middleware-next")).toBe("1");
    vi.stubEnv("NODE_ENV", "production");
    expect(proxy(request("/api/dev/outbox?to=a@b.co")).status).toBe(401);
  });
});
