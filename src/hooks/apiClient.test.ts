// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, GENERIC_UNAVAILABLE_MESSAGE, redirectToLogin } from "./apiClient";

function stubLocation(pathname = "/", search = "") {
  const location = { pathname, search, assign: vi.fn(), replace: vi.fn() };
  vi.stubGlobal("location", location);
  return location;
}

function jsonResponse(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError("corpo vazio");
      return body;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("redirectToLogin", () => {
  it("leva a /login com o motivo e o caminho atual codificado em next", () => {
    const location = stubLocation("/conta/senha", "?a=1");
    redirectToLogin("sessao_expirada");
    expect(location.assign).toHaveBeenCalledWith(
      "/login?motivo=sessao_expirada&next=%2Fconta%2Fsenha%3Fa%3D1",
    );
  });
});

describe("apiFetch", () => {
  it("envia Accept/Content-Type JSON e devolve os dados no sucesso", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ ok: true }>("/api/x", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
    });

    expect(result).toEqual({ ok: true, status: 200, data: { ok: true } });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("não envia Content-Type quando não há corpo (GET)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, []));
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("/api/stores");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Headers).has("Content-Type")).toBe(false);
  });

  it("devolve o erro da API tal como veio (401 INVALID_CREDENTIALS não redireciona)", async () => {
    const location = stubLocation();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(401, {
          error: { code: "INVALID_CREDENTIALS", message: "E-mail ou senha incorretos" },
        }),
      ),
    );

    const result = await apiFetch("/api/auth/login", { method: "POST", body: "{}" });

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: { code: "INVALID_CREDENTIALS", message: "E-mail ou senha incorretos" },
    });
    expect(location.assign).not.toHaveBeenCalled();
  });

  it("UNAUTHENTICATED redireciona para o login e nunca resolve", async () => {
    const location = stubLocation("/", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(401, { error: { code: "UNAUTHENTICATED", message: "Sessão necessária." } }),
      ),
    );

    const pending = apiFetch("/api/stores");
    const winner = await Promise.race([
      pending.then(() => "resolved"),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 50)),
    ]);

    expect(winner).toBe("timeout");
    expect(location.assign).toHaveBeenCalledWith("/login?motivo=sessao_expirada&next=%2F");
  });

  it("trata 204 sem corpo como sucesso", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(204)),
    );
    const result = await apiFetch<undefined>("/api/auth/logout", { method: "POST", body: "{}" });
    expect(result).toEqual({ ok: true, status: 204, data: undefined });
  });

  it("rede fora → AUTH_UNAVAILABLE com status 0 e mensagem genérica", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const result = await apiFetch("/api/stores");
    expect(result).toEqual({
      ok: false,
      status: 0,
      error: { code: "AUTH_UNAVAILABLE", message: GENERIC_UNAVAILABLE_MESSAGE },
    });
  });

  it("corpo não-JSON → AUTH_UNAVAILABLE sem texto do erro interno", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(502)),
    );
    const result = await apiFetch("/api/stores");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.error.code).toBe("AUTH_UNAVAILABLE");
      expect(result.error.message).toBe(GENERIC_UNAVAILABLE_MESSAGE);
    }
  });

  it("erro sem formato ApiError → AUTH_UNAVAILABLE com o status real", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(500, { detail: "stack trace" })),
    );
    const result = await apiFetch("/api/stores");
    expect(result).toEqual({
      ok: false,
      status: 500,
      error: { code: "AUTH_UNAVAILABLE", message: GENERIC_UNAVAILABLE_MESSAGE },
    });
  });
});
