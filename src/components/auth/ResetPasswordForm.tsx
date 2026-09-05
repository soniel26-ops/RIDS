"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useApiMutation } from "@/hooks/useApiMutation";
import type { AuthErrorCode, OkResponse, ResetPasswordRequest } from "@/shared/types";
import { messageForErrorCode } from "./authQuery";
import { FormAlert, FormStatus, LINK_CLASS, SubmitButton, TextField } from "./fields";
import { PASSWORD_MIN_LENGTH, validateNewPassword, type NewPasswordErrors } from "./passwordRules";
import { useHydrated } from "./useHydrated";

export const RESET_PASSWORD_REDIRECT = "/login?motivo=senha_redefinida";

export interface ResetPasswordFormProps {
  /** Token do link, já validado no formato pela página. */
  token: string;
  initialErrorCode?: AuthErrorCode | null;
}

export function ResetPasswordForm({ token, initialErrorCode = null }: ResetPasswordFormProps) {
  const hydrated = useHydrated();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<NewPasswordErrors>({});
  const { state, submit } = useApiMutation<ResetPasswordRequest, OkResponse>(
    "/api/auth/reset-password",
  );

  const busy = state.status === "submitting" || state.status === "success";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const errors = validateNewPassword(newPassword, confirmPassword);
    setFieldErrors(errors);
    if (errors.newPassword || errors.confirmPassword) return;

    const result = await submit({ token, newPassword });
    if (result.ok) {
      window.location.replace(RESET_PASSWORD_REDIRECT);
    }
  }

  let alertMessage: string | null = null;
  let alertCode: AuthErrorCode | null = null;
  let serverNewPasswordError: string | undefined;
  if (state.status === "error") {
    if (state.error.code === "VALIDATION_ERROR") serverNewPasswordError = state.error.message;
    else {
      alertMessage = state.error.message;
      alertCode = state.error.code as AuthErrorCode;
    }
  } else if (state.status === "idle" && initialErrorCode) {
    alertMessage = messageForErrorCode(initialErrorCode);
    alertCode = initialErrorCode;
  }

  return (
    <form
      method="post"
      action="/api/auth/reset-password"
      onSubmit={onSubmit}
      noValidate={hydrated}
      className="flex flex-col gap-4"
    >
      {state.status === "success" ? (
        <FormStatus>Senha redefinida. A levar ao login…</FormStatus>
      ) : null}
      {alertMessage ? (
        <FormAlert>
          {alertMessage}
          {alertCode === "INVALID_RESET_TOKEN" ? (
            <>
              {" "}
              <Link href="/esqueci-senha" className="underline">
                Pedir um novo link
              </Link>
            </>
          ) : null}
        </FormAlert>
      ) : null}

      <input type="hidden" name="token" value={token} />
      <TextField
        id="reset-new-password"
        name="newPassword"
        label="Nova senha"
        type="password"
        value={newPassword}
        onChange={setNewPassword}
        error={fieldErrors.newPassword ?? serverNewPasswordError}
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
      />
      <TextField
        id="reset-confirm-password"
        name="confirmPassword"
        label="Confirmar nova senha"
        type="password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        error={fieldErrors.confirmPassword}
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
      />

      <SubmitButton idleLabel="Redefinir senha" busyLabel="A redefinir…" busy={busy} />

      <Link href="/login" className={LINK_CLASS}>
        Voltar ao login
      </Link>
    </form>
  );
}
