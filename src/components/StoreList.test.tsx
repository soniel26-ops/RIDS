// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreList } from "./StoreList";
import type { StoreSummary } from "@/shared/types";

const stores: StoreSummary[] = [
  {
    id: "s1",
    domain: "sonielsupply.com",
    name: "Soniel Supply",
    shopifyDomain: null,
    timezone: "Europe/Paris",
    currency: "EUR",
    isActive: true,
    isConnected: true,
  },
  {
    id: "s2",
    domain: "sonielparis.fr",
    name: "Soniel Paris",
    shopifyDomain: null,
    timezone: "Europe/Paris",
    currency: "EUR",
    isActive: true,
    isConnected: false,
  },
];

function mockFetch(response: { ok: boolean; status?: number; body: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.body,
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

/** window.location substituível (acessor configurável no ambiente jsdom do Vitest). */
function stubLocation(pathname: string) {
  const location = { pathname, search: "", assign: vi.fn(), replace: vi.fn() };
  vi.stubGlobal("location", location);
  return location;
}

describe("StoreList", () => {
  it("mostra o estado de carregamento", () => {
    mockFetch({ ok: true, body: stores });
    render(<StoreList />);
    expect(screen.getByRole("status")).toHaveTextContent(/carregando/i);
  });

  it("lista as lojas com o estado de conexão", async () => {
    mockFetch({ ok: true, body: stores });
    render(<StoreList />);
    await waitFor(() => expect(screen.getByText("sonielparis.fr")).toBeInTheDocument());
    expect(screen.getByText("Soniel Supply")).toBeInTheDocument();
    expect(screen.getByText("Conectada")).toBeInTheDocument();
    expect(screen.getByText("Aguardando conexão")).toBeInTheDocument();
  });

  it("mostra a mensagem de erro da API", async () => {
    mockFetch({
      ok: false,
      status: 503,
      body: { error: { code: "STORES_UNAVAILABLE", message: "Não foi possível listar as lojas." } },
    });
    render(<StoreList />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível listar as lojas."),
    );
  });

  it("mostra o estado vazio", async () => {
    mockFetch({ ok: true, body: [] });
    render(<StoreList />);
    await waitFor(() => expect(screen.getByText(/nenhuma loja/i)).toBeInTheDocument());
  });

  it("CA-11: 401 UNAUTHENTICATED redireciona para o login sem mostrar erro", async () => {
    const location = stubLocation("/");
    mockFetch({
      ok: false,
      status: 401,
      body: { error: { code: "UNAUTHENTICATED", message: "Sessão necessária." } },
    });
    render(<StoreList />);

    await waitFor(() =>
      expect(location.assign).toHaveBeenCalledWith("/login?motivo=sessao_expirada&next=%2F"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/carregando/i);
    expect(screen.queryByText("Sessão necessária.")).not.toBeInTheDocument();
  });
});
