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
import { LoginForm } from "./LoginForm";

const user = { id: "u1", email: "dono@exemplo.test", role: "OWNER" };

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: password } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

afterEach(() => vi.unstubAllGlobals());

describe("LoginForm", () => {
  it("CA-9: campos vazios mostram a indicação junto ao campo e não chamam a API", () => {
    const fetchMock = stubFetch({ status: 200, body: { user } });
    render(<LoginForm next="/" />);

    submit();

    expect(screen.getByText("Informe o e-mail.")).toBeInTheDocument();
    expect(screen.getByText("Informe a senha.")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toHaveAttribute(
      "aria-describedby",
      "login-email-error",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("CA-9: e-mail em formato inválido é recusado localmente", () => {
    const fetchMock = stubFetch({ status: 200, body: { user } });
    render(<LoginForm next="/" />);

    fill("nao-e-um-email", "segredo-1234");
    submit();

    expect(screen.getByText("E-mail inválido.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("CA-2: login válido envia JSON para /api/auth/login e navega para next", async () => {
    const location = stubLocation("/login", "?next=%2Fconta%2Fsenha");
    const fetchMock = stubFetch({ status: 200, body: { user } });
    render(<LoginForm next="/conta/senha" />);

    fill(" Dono@Exemplo.test ", "segredo-1234");
    submit();

    await waitFor(() => expect(location.assign).toHaveBeenCalledWith("/conta/senha"));
    const request = lastRequest(fetchMock);
    expect(request.url).toBe("/api/auth/login");
    expect(request.method).toBe("POST");
    expect(request.body).toEqual({
      email: "Dono@Exemplo.test",
      password: "segredo-1234",
      next: "/conta/senha",
    });
  });

  it("mostra 'A entrar…' com o botão desabilitado enquanto aguarda (sem duplo envio)", async () => {
    const fetchMock = stubPendingFetch();
    render(<LoginForm next="/" />);

    fill("dono@exemplo.test", "segredo-1234");
    submit();

    const busyButton = await screen.findByRole("button", { name: "A entrar…" });
    expect(busyButton).toBeDisabled();
    expect(busyButton).toHaveAttribute("aria-busy", "true");
    fireEvent.submit(busyButton.closest("form") as HTMLFormElement);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("CA-7/CA-8: 401 INVALID_CREDENTIALS mostra a mensagem genérica e não redireciona", async () => {
    const location = stubLocation("/login");
    stubFetch(apiError(401, "INVALID_CREDENTIALS", "E-mail ou senha incorretos"));
    render(<LoginForm next="/" />);

    fill("dono@exemplo.test", "senha-errada-1");
    submit();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("E-mail ou senha incorretos"),
    );
    expect(location.assign).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("CA-18: 429 TOO_MANY_ATTEMPTS mostra a mensagem da API", async () => {
    stubFetch(
      apiError(
        429,
        "TOO_MANY_ATTEMPTS",
        "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
      ),
    );
    render(<LoginForm next="/" />);

    fill("dono@exemplo.test", "segredo-1234");
    submit();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
      ),
    );
  });

  it("CA-13: 503 mostra a mensagem genérica, sem texto do erro interno", async () => {
    stubFetch(
      apiError(
        503,
        "AUTH_UNAVAILABLE",
        "O serviço está indisponível de momento. Tente mais tarde.",
      ),
    );
    render(<LoginForm next="/" />);

    fill("dono@exemplo.test", "segredo-1234");
    submit();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "O serviço está indisponível de momento. Tente mais tarde.",
      ),
    );
    expect(screen.queryByText(/ECONNREFUSED|prisma|redis/i)).not.toBeInTheDocument();
  });

  it("resposta sem formato ApiError vira mensagem genérica (nunca o corpo bruto)", async () => {
    stubFetch({ status: 500, body: { stack: "Error: connect ECONNREFUSED" } });
    render(<LoginForm next="/" />);

    fill("dono@exemplo.test", "segredo-1234");
    submit();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "O serviço está indisponível de momento. Tente mais tarde.",
      ),
    );
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
  });

  it("CA-11: aviso de sessão terminada em role=status", () => {
    render(<LoginForm next="/" notice="sessao_expirada" />);
    expect(screen.getByRole("status")).toHaveTextContent("A sua sessão terminou. Entre de novo.");
  });

  it("CA-25: aviso de senha redefinida em role=status", () => {
    render(<LoginForm next="/" notice="senha_redefinida" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Senha redefinida. Entre com a nova senha.",
    );
  });

  it("sem JavaScript: ?erro= vira a mensagem fixa e o formulário nativo aponta para a API", () => {
    render(<LoginForm next="/conta/senha" initialErrorCode="INVALID_CREDENTIALS" />);
    expect(screen.getByRole("alert")).toHaveTextContent("E-mail ou senha incorretos");
    const form = screen.getByRole("button", { name: "Entrar" }).closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/api/auth/login");
    expect(form?.querySelector('input[name="next"]')).toHaveValue("/conta/senha");
  });

  it("CA-14: não há criação de conta; há o link 'Esqueci a senha'", () => {
    render(<LoginForm next="/" />);
    expect(screen.getByRole("link", { name: "Esqueci a senha" })).toHaveAttribute(
      "href",
      "/esqueci-senha",
    );
    expect(screen.queryByText(/criar conta|registar|cadastr/i)).not.toBeInTheDocument();
  });
});
