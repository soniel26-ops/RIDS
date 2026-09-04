import { vi } from "vitest";

/** window.location substituível (o ambiente jsdom do Vitest expõe `location` como acessor configurável). */
export function stubLocation(pathname = "/", search = "") {
  const location = { pathname, search, assign: vi.fn(), replace: vi.fn() };
  vi.stubGlobal("location", location);
  return location;
}

export type FetchScript = { status: number; body?: unknown };

/** fetch falso que responde JSON (ou 204 sem corpo) e regista as chamadas. */
export function stubFetch(...responses: FetchScript[]) {
  let index = 0;
  const fetchMock = vi.fn(async () => {
    const response = responses[Math.min(index, responses.length - 1)] ?? { status: 500 };
    index += 1;
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => {
        if (response.body === undefined) throw new SyntaxError("sem corpo");
        return response.body;
      },
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** fetch que nunca responde: mantém o formulário em "a enviar". */
export function stubPendingFetch() {
  const fetchMock = vi.fn(() => new Promise<never>(() => {}));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function lastRequest(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit] | undefined;
  if (!call) throw new Error("fetch não foi chamado");
  const [url, init] = call;
  return {
    url,
    method: init.method,
    body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
  };
}

export function apiError(status: number, code: string, message: string): FetchScript {
  return { status, body: { error: { code, message } } };
}
