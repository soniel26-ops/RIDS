"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useApiMutation } from "@/hooks/useApiMutation";
import type { AuthErrorCode, ChangePasswordRequest, OkResponse } from "@/shared/types";
import { messageForErrorCode } from "./authQuery";
import { FormAlert, FormStatus, LINK_CLASS, SubmitButton, TextField } from "./fields";
import { PASSWORD_MIN_LENGTH, validateNewPassword, type NewPasswordErrors } from "./passwordRules";
import { useHydrated } from "./useHydrated";

export const PASSWORD_CHANGED_MESSAGE = "Senha alterada com sucesso.";
export const CURRENT_PASSWORD_REQUIRED_MESSAGE = "Informe a senha atual.";

export interface ChangePasswordFormProps {
  /** ?ok=1 (caminho sem JavaScript). */
  ok?: boolean;
  initialErrorCode?: AuthErrorCode | null;
}

type FieldErrors = NewPasswordErrors & { currentPassword?: string };

export function ChangePasswordForm({
  ok = false,
  initialErrorCode = null,
}: ChangePasswordFormProps) {
  const hydrated = useHydrated();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const { state, submit } = useApiMutation<ChangePasswordRequest, OkResponse>(
    "/api/auth/change-password",
  );

  const busy = state.status === "submitting";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const errors: FieldErrors = validateNewPassword(newPassword, confirmPassword);
    if (currentPassword === "") errors.currentPassword = CURRENT_PASSWORD_REQUIRED_MESSAGE;
    setFieldErrors(errors);
    if (errors.currentPassword || errors.newPassword || errors.confirmPassword) return;

    const result = await submit({ currentPassword, newPassword });
    if (result.ok) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }

  const showOk = state.status === "success" || (ok && state.status === "idle");
  let alertMessage: string | null = null;
  const serverFieldErrors: FieldErrors = {};
  if (state.status === "error") {
    if (state.error.code === "VALIDATION_ERROR") {
      // "Informe a senha." só pode vir do campo da senha atual; o resto é da nova senha.
      if (state.error.message === "Informe a senha.") {
        serverFieldErrors.currentPassword = state.error.message;
      } else {
        serverFieldErrors.newPassword = state.error.message;
      }
    } else {
      alertMessage = state.error.message;
    }
  } else if (state.status === "idle" && initialErrorCode) {
    alertMessage = messageForErrorCode(initialErrorCode);
  }

  return (
    <form
      method="post"
      action="/api/auth/change-password"
      onSubmit={onSubmit}
      noValidate={hydrated}
      className="flex flex-col gap-4"
    >
      {showOk ? <FormStatus>{PASSWORD_CHANGED_MESSAGE}</FormStatus> : null}
      {alertMessage ? <FormAlert>{alertMessage}</FormAlert> : null}

      <TextField
        id="change-current-password"
        name="currentPassword"
        label="Senha atual"
        type="password"
        value={currentPassword}
        onChange={setCurrentPassword}
        error={fieldErrors.currentPassword ?? serverFieldErrors.currentPassword}
        autoComplete="current-password"
        required
      />
      <TextField
        id="change-new-password"
        name="newPassword"
        label="Nova senha"
        type="password"
        value={newPassword}
        onChange={setNewPassword}
        error={fieldErrors.newPassword ?? serverFieldErrors.newPassword}
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
      />
      <TextField
        id="change-confirm-password"
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

      <SubmitButton idleLabel="Alterar senha" busyLabel="A alterar…" busy={busy} />

      <Link href="/" className={LINK_CLASS}>
        Voltar às lojas
      </Link>
    </form>
  );
}
