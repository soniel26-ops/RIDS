import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "./auth.errors";
import {
  apiErrorResponse,
  assertSameOrigin,
  clearSessionCookie,
  errorOutcome,
  isFormRequest,
  readAuthBody,
  respondAuth,
  SESSION_COOKIE,
  setSessionCookie,
  toAuthError,
  withQuery,
} from "./http";

const URL_LOGIN = "http://localhost:3000/api/auth/login";

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(URL_LOGIN, {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3000", ...headers },
    body: JSON.stringify(body),
  });
}

function formRequest(fields: Record<string, string>, headers: Record<string, string> = {}) {
  return new NextRequest(URL_LOGIN, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      host: "localhost:3000",
      ...headers,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

afterEach(() => vi.restoreAllMocks());

describe("readAuthBody / isFormRequest", () => {
  it("lê JSON", async () => {
    const request = jsonRequest({ email: "a@b.co", password: "x" });
    expect(isFormRequest(request)).toBe(false);
    expect(await readAuthBody(request)).toEqual({ email: "a@b.co", password: "x" });
  });

  it("lê formulário nativo como objeto plano", async () => {
    const request = formRequest({ email: "a@b.co", password: "x", next: "/conta" });
    expect(isFormRequest(request)).toBe(true);
    expect(await readAuthBody(request)).toEqual({ email: "a@b.co", password: "x", next: "/conta" });
  });

  it("devolve {} para corpo vazio, JSON inválido ou não-objeto", async () => {
    const empty = new NextRequest(URL_LOGIN, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(await readAuthBody(empty)).toEqual({});
    const invalid = new NextRequest(URL_LOGIN, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{nope",
    });
    expect(await readAuthBody(invalid)).toEqual({});
    expect(await readAuthBody(jsonRequest([1, 2]))).toEqual({});
    const noType = new NextRequest(URL_LOGIN, { method: "POST" });
    expect(await readAuthBody(noType)).toEqual({});
  });
});

describe("cookie de sessão", () => {
  const expires = new Date("2026-09-11T12:00:00Z");

  it("grava HttpOnly, SameSite=Lax, Path=/, Expires e sem Secure fora de produção", () => {
    const response = setSessionCookie(NextResponse.json({}), "tok", expires, {
      NODE_ENV: "development",
    });
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toMatch(/^rids_session=tok;/);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=lax/i);
    expect(header).toMatch(/Path=\//);
    expect(header).toMatch(/Expires=Fri, 11 Sep 2026 12:00:00 GMT/);
    expect(header).not.toMatch(/Secure/i);
  });

  it("liga Secure em produção", () => {
    const response = setSessionCookie(NextResponse.json({}), "tok", expires, {
      NODE_ENV: "production",
    });
    expect(response.headers.get("set-cookie")).toMatch(/Secure/i);
  });

  it("apaga o cookie com valor vazio e Max-Age=0", () => {
    const response = clearSessionCookie(NextResponse.json({}), { NODE_ENV: "development" });
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toMatch(/^rids_session=;/);
    expect(header).toMatch(/Max-Age=0/i);
    expect(header).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(SESSION_COOKIE).toBe("rids_session");
  });
});

describe("respondAuth", () => {
  it("devolve a resposta JSON tal como está quando o pedido veio em JSON", () => {
    const json = NextResponse.json({ ok: true }, { status: 200 });
    const response = respondAuth(jsonRequest({}), { json, formRedirect: "/x" });
    expect(response).toBe(json);
  });

  it("redireciona 303 para a página quando veio de formulário, mantendo o cookie", () => {
    const json = setSessionCookie(
      NextResponse.json({ ok: true }),
      "tok",
      new Date(Date.now() + 1000),
    );
    const response = respondAuth(formRequest({}), { json, formRedirect: "/conta/senha" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/conta/senha");
    expect(response.headers.get("set-cookie")).toMatch(/^rids_session=tok;/);
  });

  it("o Location é relativo: não herda o hostname de request.url nem o Host do pedido", () => {
    // request.url diz "localhost" (hostname configurado do servidor) e o navegador
    // pediu por 127.0.0.1:3000: o 303 tem de ficar no host do pedido, seja ele qual for.
    const request = formRequest({}, { host: "127.0.0.1:3000" });
    expect(new URL(request.url).hostname).toBe("localhost");
    const json = NextResponse.json({ ok: true });
    const response = respondAuth(request, { json, formRedirect: "/login?erro=X&next=%2F" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login?erro=X&next=%2F");
    expect(response.headers.get("location")).not.toContain("localhost");
    expect(response.headers.get("location")).not.toContain("127.0.0.1");
  });

  it("um formRedirect que não seja caminho interno cai em / (defesa em profundidade)", () => {
    const json = NextResponse.json({ ok: true });
    for (const bad of ["https://evil.example/", "//evil.example", "/\\evil", "login"]) {
      const response = respondAuth(formRequest({}), { json, formRedirect: bad });
      expect(response.headers.get("location")).toBe("/");
    }
    const ok = respondAuth(formRequest({}), {
      json,
      formRedirect: "/redefinir-senha?erro=X&token=abc",
    });
    expect(ok.headers.get("location")).toBe("/redefinir-senha?erro=X&token=abc");
  });

  it("errorOutcome produz ApiError em JSON e ?erro=<code> no formulário", async () => {
    const outcome = errorOutcome(new AuthError("INVALID_CREDENTIALS"), "/login", {
      next: "/conta",
    });
    expect(outcome.json.status).toBe(401);
    await expect(outcome.json.json()).resolves.toEqual({
      error: { code: "INVALID_CREDENTIALS", message: "E-mail ou senha incorretos" },
    });
    expect(outcome.formRedirect).toBe("/login?erro=INVALID_CREDENTIALS&next=%2Fconta");
  });
});

describe("withQuery / apiErrorResponse / toAuthError", () => {
  it("withQuery omite undefined e respeita query existente", () => {
    expect(withQuery("/login", { next: undefined })).toBe("/login");
    expect(withQuery("/login", { motivo: "sessao_expirada", next: "/a?b=1" })).toBe(
      "/login?motivo=sessao_expirada&next=%2Fa%3Fb%3D1",
    );
    expect(withQuery("/r?token=abc", { erro: "X" })).toBe("/r?token=abc&erro=X");
  });

  it("apiErrorResponse usa o status do código", async () => {
    const response = apiErrorResponse(new AuthError("TOO_MANY_ATTEMPTS"));
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "TOO_MANY_ATTEMPTS",
        message: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
      },
    });
  });

  it("toAuthError mantém AuthError e converte o resto em AUTH_UNAVAILABLE logando só a mensagem", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const original = new AuthError("INVALID_RESET_TOKEN");
    expect(toAuthError(original, "ctx")).toBe(original);
    const converted = toAuthError(new Error("password=abc falhou no banco"), "POST /x");
    expect(converted.code).toBe("AUTH_UNAVAILABLE");
    expect(converted.message).toBe("O serviço está indisponível de momento. Tente mais tarde.");
    expect(error).toHaveBeenCalledWith("POST /x falhou", "password=abc falhou no banco");
  });
});

describe("assertSameOrigin", () => {
  it("segue sem Origin", () => {
    expect(() => assertSameOrigin(jsonRequest({}))).not.toThrow();
  });

  it("aceita Origin igual ao Host", () => {
    expect(() =>
      assertSameOrigin(jsonRequest({}, { origin: "http://localhost:3000" })),
    ).not.toThrow();
  });

  it("aceita Origin igual ao X-Forwarded-Host", () => {
    expect(() =>
      assertSameOrigin(
        jsonRequest(
          {},
          { origin: "https://rids.exemplo.com", "x-forwarded-host": "rids.exemplo.com" },
        ),
      ),
    ).not.toThrow();
  });

  it("recusa Origin de outro host ou inválida com FORBIDDEN_ORIGIN", () => {
    expect(() => assertSameOrigin(jsonRequest({}, { origin: "https://evil.example" }))).toThrow(
      expect.objectContaining({ code: "FORBIDDEN_ORIGIN", status: 403 }),
    );
    expect(() => assertSameOrigin(jsonRequest({}, { origin: "null" }))).toThrow(
      expect.objectContaining({ code: "FORBIDDEN_ORIGIN" }),
    );
  });
});
