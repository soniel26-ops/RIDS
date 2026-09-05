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
import { ResetPasswordForm } from "./ResetPasswordForm";

const TOKEN = "a".repeat(43);

function fillAndSubmit(newPassword: string, confirmPassword = newPassword) {
  fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: newPassword } });
  fireEvent.change(screen.getByLabelText("Confirmar nova senha"), {
    target: { value: confirmPassword },
  });
  fireEvent.click(screen.getByRole("button", { name: "Redefinir senha" }));
}

afterEach(() => vi.unstubAllGlobals());

describe("ResetPasswordForm", () => {
  it("CA-27: nova senha com 9 caracteres é recusada com a indicação do mínimo, sem chamar a API", () => {
    const fetchMock = stubFetch({ status: 200, body: { ok: true } });
    render(<ResetPasswordForm token={TOKEN} />);
    fillAndSubmit("123456789");
    expect(screen.getByText("A senha deve ter pelo menos 10 caracteres.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("senhas diferentes são recusadas localmente", () => {
    const fetchMock = stubFetch({ status: 200, body: { ok: true } });
    render(<ResetPasswordForm token={TOKEN} />);
    fillAndSubmit("nova-senha-1234", "nova-senha-4321");
    expect(screen.getByText("As senhas não coincidem.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("CA-25: sucesso envia token e nova senha e leva a /login?motivo=senha_redefinida", async () => {
    const location = stubLocation("/redefinir-senha", `?token=${TOKEN}`);
    const fetchMock = stubFetch({ status: 200, body: { ok: true } });
    render(<ResetPasswordForm token={TOKEN} />);

    fillAndSubmit("nova-senha-1234");

    await waitFor(() =>
      expect(location.replace).toHaveBeenCalledWith("/login?motivo=senha_redefinida"),
    );
    const request = lastRequest(fetchMock);
    expect(request.url).toBe("/api/auth/reset-password");
    expect(request.method).toBe("POST");
    expect(request.body).toEqual({ token: TOKEN, newPassword: "nova-senha-1234" });
  });

  it("mostra 'A redefinir…' desabilitado enquanto aguarda", async () => {
    stubPendingFetch();
    render(<ResetPasswordForm token={TOKEN} />);
    fillAndSubmit("nova-senha-1234");
    expect(await screen.findByRole("button", { name: "A redefinir…" })).toBeDisabled();
  });

  it("CA-29: INVALID_RESET_TOKEN mostra a mensagem e o link para pedir um novo", async () => {
    const location = stubLocation();
    stubFetch(
      apiError(400, "INVALID_RESET_TOKEN", "Este link é inválido ou expirou; peça um novo"),
    );
    render(<ResetPasswordForm token={TOKEN} />);

    fillAndSubmit("nova-senha-1234");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Este link é inválido ou expirou; peça um novo",
      ),
    );
    expect(screen.getByRole("link", { name: "Pedir um novo link" })).toHaveAttribute(
      "href",
      "/esqueci-senha",
    );
    expect(location.replace).not.toHaveBeenCalled();
  });

  it("VALIDATION_ERROR do servidor aparece junto ao campo da nova senha", async () => {
    stubFetch(apiError(400, "VALIDATION_ERROR", "Senha demasiado longa."));
    render(<ResetPasswordForm token={TOKEN} />);
    fillAndSubmit("nova-senha-1234");
    await waitFor(() => expect(screen.getByText("Senha demasiado longa.")).toBeInTheDocument());
    expect(screen.getByLabelText("Nova senha")).toHaveAttribute(
      "aria-describedby",
      "reset-new-password-error",
    );
  });

  it("CA-13: 503 AUTH_UNAVAILABLE mostra a mensagem genérica", async () => {
    stubFetch(
      apiError(
        503,
        "AUTH_UNAVAILABLE",
        "O serviço está indisponível de momento. Tente mais tarde.",
      ),
    );
    render(<ResetPasswordForm token={TOKEN} />);
    fillAndSubmit("nova-senha-1234");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "O serviço está indisponível de momento. Tente mais tarde.",
      ),
    );
  });

  it("sem JavaScript: token em campo oculto, action nativa e ?erro= com a mensagem fixa", () => {
    render(<ResetPasswordForm token={TOKEN} initialErrorCode="INVALID_RESET_TOKEN" />);
    const form = screen.getByRole("button", { name: "Redefinir senha" }).closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/api/auth/reset-password");
    expect(form?.querySelector('input[name="token"]')).toHaveValue(TOKEN);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Este link é inválido ou expirou; peça um novo",
    );
  });
});
