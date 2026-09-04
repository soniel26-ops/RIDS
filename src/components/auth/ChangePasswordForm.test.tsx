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
import { ChangePasswordForm } from "./ChangePasswordForm";

function fill(current: string, next: string, confirm = next) {
  fireEvent.change(screen.getByLabelText("Senha atual"), { target: { value: current } });
  fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: next } });
  fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: confirm } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Alterar senha" }));
}

afterEach(() => vi.unstubAllGlobals());

describe("ChangePasswordForm", () => {
  it("CA-27: nova senha com 9 caracteres é recusada com a indicação do mínimo, sem chamar a API", () => {
    const fetchMock = stubFetch({ status: 200, body: { ok: true } });
    render(<ChangePasswordForm />);
    fill("senha-atual-1", "123456789");
    submit();
    expect(screen.getByText("A senha deve ter pelo menos 10 caracteres.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("senha atual vazia e confirmação diferente são recusadas localmente", () => {
    const fetchMock = stubFetch({ status: 200, body: { ok: true } });
    render(<ChangePasswordForm />);
    fill("", "nova-senha-1234", "outra-senha-1234");
    submit();
    expect(screen.getByText("Informe a senha atual.")).toBeInTheDocument();
    expect(screen.getByText("As senhas não coincidem.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("CA-22: sucesso mostra 'Senha alterada com sucesso.', limpa os campos e não navega", async () => {
    const location = stubLocation("/conta/senha");
    const fetchMock = stubFetch({ status: 200, body: { ok: true } });
    render(<ChangePasswordForm />);

    fill("senha-atual-1", "nova-senha-1234");
    submit();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Senha alterada com sucesso."),
    );
    expect(screen.getByLabelText("Senha atual")).toHaveValue("");
    expect(screen.getByLabelText("Nova senha")).toHaveValue("");
    expect(screen.getByLabelText("Confirmar nova senha")).toHaveValue("");
    expect(location.assign).not.toHaveBeenCalled();
    expect(location.replace).not.toHaveBeenCalled();
    const request = lastRequest(fetchMock);
    expect(request.url).toBe("/api/auth/change-password");
    expect(request.method).toBe("POST");
    expect(request.body).toEqual({
      currentPassword: "senha-atual-1",
      newPassword: "nova-senha-1234",
    });
  });

  it("mostra 'A alterar…' desabilitado enquanto aguarda", async () => {
    stubPendingFetch();
    render(<ChangePasswordForm />);
    fill("senha-atual-1", "nova-senha-1234");
    submit();
    expect(await screen.findByRole("button", { name: "A alterar…" })).toBeDisabled();
  });

  it("CA-26: INVALID_CURRENT_PASSWORD mostra 'Senha atual incorreta'", async () => {
    stubFetch(apiError(400, "INVALID_CURRENT_PASSWORD", "Senha atual incorreta"));
    render(<ChangePasswordForm />);
    fill("senha-errada-1", "nova-senha-1234");
    submit();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Senha atual incorreta"),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("CA-18: TOO_MANY_ATTEMPTS mostra a mensagem da API", async () => {
    stubFetch(
      apiError(
        429,
        "TOO_MANY_ATTEMPTS",
        "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
      ),
    );
    render(<ChangePasswordForm />);
    fill("senha-atual-1", "nova-senha-1234");
    submit();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
      ),
    );
  });

  it("CA-11: UNAUTHENTICATED redireciona para o login sem mostrar erro", async () => {
    const location = stubLocation("/conta/senha", "");
    stubFetch(apiError(401, "UNAUTHENTICATED", "Sessão necessária."));
    render(<ChangePasswordForm />);
    fill("senha-atual-1", "nova-senha-1234");
    submit();
    await waitFor(() =>
      expect(location.assign).toHaveBeenCalledWith(
        "/login?motivo=sessao_expirada&next=%2Fconta%2Fsenha",
      ),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A alterar…" })).toBeDisabled();
  });

  it("sem JavaScript: ?ok=1 mostra a confirmação e o formulário nativo aponta para a API", () => {
    render(<ChangePasswordForm ok />);
    expect(screen.getByRole("status")).toHaveTextContent("Senha alterada com sucesso.");
    const form = screen.getByRole("button", { name: "Alterar senha" }).closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/api/auth/change-password");
  });

  it("sem JavaScript: ?erro=INVALID_CURRENT_PASSWORD mostra a mensagem fixa", () => {
    render(<ChangePasswordForm initialErrorCode="INVALID_CURRENT_PASSWORD" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Senha atual incorreta");
  });

  it("tem o link 'Voltar às lojas'", () => {
    render(<ChangePasswordForm />);
    expect(screen.getByRole("link", { name: "Voltar às lojas" })).toHaveAttribute("href", "/");
  });
});
