// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiError,
  lastRequest,
  stubFetch,
  stubPendingFetch,
} from "@/components/testing/authTestUtils";
import { ForgotPasswordForm, FORGOT_PASSWORD_SENT_MESSAGE } from "./ForgotPasswordForm";

function fillAndSubmit(email: string) {
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar link" }));
}

afterEach(() => vi.unstubAllGlobals());

describe("ForgotPasswordForm", () => {
  it("e-mail vazio é recusado localmente sem chamar a API", () => {
    const fetchMock = stubFetch({ status: 200, body: { ok: true } });
    render(<ForgotPasswordForm />);
    fillAndSubmit("");
    expect(screen.getByText("Informe o e-mail.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("CA-24: sucesso mostra a frase neutra em role=status e limpa o campo", async () => {
    const fetchMock = stubFetch({ status: 200, body: { ok: true } });
    render(<ForgotPasswordForm />);

    fillAndSubmit("dono@exemplo.test");

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(FORGOT_PASSWORD_SENT_MESSAGE),
    );
    expect(screen.getByLabelText("E-mail")).toHaveValue("");
    const request = lastRequest(fetchMock);
    expect(request.url).toBe("/api/auth/forgot-password");
    expect(request.method).toBe("POST");
    expect(request.body).toEqual({ email: "dono@exemplo.test" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mostra 'A enviar…' desabilitado enquanto aguarda", async () => {
    stubPendingFetch();
    render(<ForgotPasswordForm />);
    fillAndSubmit("dono@exemplo.test");
    expect(await screen.findByRole("button", { name: "A enviar…" })).toBeDisabled();
  });

  it("CA-36: 429 mostra a mensagem da API em role=alert", async () => {
    stubFetch(
      apiError(
        429,
        "TOO_MANY_ATTEMPTS",
        "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
      ),
    );
    render(<ForgotPasswordForm />);
    fillAndSubmit("dono@exemplo.test");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
      ),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("CA-30: 503 MAIL_UNAVAILABLE mostra o texto genérico de indisponibilidade", async () => {
    stubFetch(
      apiError(503, "MAIL_UNAVAILABLE", "Não foi possível enviar agora, tente mais tarde."),
    );
    render(<ForgotPasswordForm />);
    fillAndSubmit("dono@exemplo.test");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não foi possível enviar agora, tente mais tarde.",
      ),
    );
  });

  it("sem JavaScript: ?enviado=1 mostra a frase neutra e o formulário nativo aponta para a API", () => {
    render(<ForgotPasswordForm sent />);
    expect(screen.getByRole("status")).toHaveTextContent(FORGOT_PASSWORD_SENT_MESSAGE);
    const form = screen.getByRole("button", { name: "Enviar link" }).closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/api/auth/forgot-password");
  });

  it("sem JavaScript: ?erro=TOO_MANY_ATTEMPTS mostra a mensagem fixa", () => {
    render(<ForgotPasswordForm initialErrorCode="TOO_MANY_ATTEMPTS" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
    );
  });

  it("tem o link 'Voltar ao login'", () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByRole("link", { name: "Voltar ao login" })).toHaveAttribute("href", "/login");
  });
});
