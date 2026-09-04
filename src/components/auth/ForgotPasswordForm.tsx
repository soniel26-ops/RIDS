"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useApiMutation } from "@/hooks/useApiMutation";
import type { AuthErrorCode, ForgotPasswordRequest, OkResponse } from "@/shared/types";
import { messageForErrorCode } from "./authQuery";
import { FormAlert, FormStatus, LINK_CLASS, SubmitButton, TextField } from "./fields";
import { EMAIL_PATTERN } from "./LoginForm";
import { useHydrated } from "./useHydrated";

/** Frase neutra de CA-24/CA-28: igual para e-mail existente e inexistente. */
export const FORGOT_PASSWORD_SENT_MESSAGE =
  "Se existir uma conta com este e-mail, enviámos um link para redefinir a senha";

export interface ForgotPasswordFormProps {
  /** ?enviado=1 (caminho sem JavaScript). */
  sent?: boolean;
  initialErrorCode?: AuthErrorCode | null;
}

export function ForgotPasswordForm({
  sent = false,
  initialErrorCode = null,
}: ForgotPasswordFormProps) {
  const hydrated = useHydrated();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const { state, submit } = useApiMutation<ForgotPasswordRequest, OkResponse>(
    "/api/auth/forgot-password",
  );

  const busy = state.status === "submitting";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const trimmed = email.trim();
    const error =
      trimmed === ""
        ? "Informe o e-mail."
        : !EMAIL_PATTERN.test(trimmed)
          ? "E-mail inválido."
          : undefined;
    setFieldError(error);
    if (error) return;

    const result = await submit({ email: trimmed });
    if (result.ok) setEmail("");
  }

  const showSent = state.status === "success" || (sent && state.status === "idle");
  let alertMessage: string | null = null;
  let serverFieldError: string | undefined;
  if (state.status === "error") {
    if (state.error.code === "VALIDATION_ERROR") serverFieldError = state.error.message;
    else alertMessage = state.error.message;
  } else if (state.status === "idle" && initialErrorCode) {
    alertMessage = messageForErrorCode(initialErrorCode);
  }

  return (
    <form
      method="post"
      action="/api/auth/forgot-password"
      onSubmit={onSubmit}
      noValidate={hydrated}
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Informe o e-mail da sua conta. O link enviado vale por 1 hora e só pode ser usado uma vez.
      </p>
      {showSent ? <FormStatus>{FORGOT_PASSWORD_SENT_MESSAGE}</FormStatus> : null}
      {alertMessage ? <FormAlert>{alertMessage}</FormAlert> : null}

      <TextField
        id="forgot-email"
        name="email"
        label="E-mail"
        type="email"
        value={email}
        onChange={setEmail}
        error={fieldError ?? serverFieldError}
        autoComplete="username"
        required
      />

      <SubmitButton idleLabel="Enviar link" busyLabel="A enviar…" busy={busy} />

      <Link href="/login" className={LINK_CLASS}>
        Voltar ao login
      </Link>
    </form>
  );
}
