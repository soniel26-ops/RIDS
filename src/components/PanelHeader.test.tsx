// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiError,
  lastRequest,
  stubFetch,
  stubLocation,
  stubPendingFetch,
} from "@/components/testing/authTestUtils";
import type { CurrentUser } from "@/shared/types";
import { PanelHeader } from "./PanelHeader";

const owner: CurrentUser = { id: "u1", email: "dono@exemplo.test", role: "OWNER" };

afterEach(() => vi.unstubAllGlobals());

describe("PanelHeader", () => {
  it("CA-23/CA-32: mostra o e-mail, o cargo 'Proprietário', 'Alterar senha' e 'Sair'", () => {
    render(<PanelHeader user={owner} />);
    expect(screen.getByText("dono@exemplo.test")).toBeInTheDocument();
    expect(screen.getByText("Proprietário")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alterar senha" })).toHaveAttribute(
      "href",
      "/conta/senha",
    );
    expect(screen.getByRole("button", { name: "Sair" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("RIDS");
  });

  it("CA-31: mostra os rótulos dos outros cargos", () => {
    const { unmount } = render(<PanelHeader user={{ ...owner, role: "ADMIN" }} />);
    expect(screen.getByText("Admin")).toBeInTheDocument();
    unmount();
    render(<PanelHeader user={{ ...owner, role: "MARKETING" }} />);
    expect(screen.getByText("Marketing")).toBeInTheDocument();
  });

  it("CA-5: 'Sair' chama POST /api/auth/logout e navega para /login", async () => {
    const location = stubLocation("/");
    const fetchMock = stubFetch({ status: 204 });
    render(<PanelHeader user={owner} />);

    fireEvent.click(screen.getByRole("button", { name: "Sair" }));

    await waitFor(() => expect(location.replace).toHaveBeenCalledWith("/login"));
    const request = lastRequest(fetchMock);
    expect(request.url).toBe("/api/auth/logout");
    expect(request.method).toBe("POST");
  });

  it("mostra 'A sair…' desabilitado enquanto aguarda", async () => {
    stubPendingFetch();
    render(<PanelHeader user={owner} />);
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    expect(await screen.findByRole("button", { name: "A sair…" })).toBeDisabled();
  });

  it("se a API de logout falhar, ainda assim vai para /login", async () => {
    const location = stubLocation("/");
    stubFetch(
      apiError(
        503,
        "AUTH_UNAVAILABLE",
        "O serviço está indisponível de momento. Tente mais tarde.",
      ),
    );
    render(<PanelHeader user={owner} />);
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    await waitFor(() => expect(location.replace).toHaveBeenCalledWith("/login"));
  });

  it("sem JavaScript: o formulário nativo de 'Sair' aponta para a API", () => {
    render(<PanelHeader user={owner} />);
    const form = screen.getByRole("button", { name: "Sair" }).closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/api/auth/logout");
  });
});
