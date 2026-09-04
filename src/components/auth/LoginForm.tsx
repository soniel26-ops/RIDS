"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useApiMutation } from "@/hooks/useApiMutation";
import { toSafeInternalPath } from "@/shared/safe-path";
import type { AuthErrorCode, LoginNotice, LoginRequest, LoginResponse } from "@/shared/types";
import { LOGIN_NOTICE_MESSAGES, messageForErrorCode } from "./authQuery";
import { FormAlert, FormStatus, LINK_CLASS, SubmitButton, TextField } from "./fields";
import { useHydrated } from "./useHydrated";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface LoginFormProps {
  /** Destino após o login, já passado por toSafeInternalPath na página. */
  next: string;
  notice?: LoginNotice | null;
  /** Código vindo em ?erro= (caminho sem JavaScript). */
  initialErrorCode?: AuthErrorCode | null;
}

type FieldErrors = { email?: string; password?: string };

/** CA-9: validação local com as mesmas mensagens do servidor; nada é enviado se falhar. */
export function validateLogin(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  const trimmed = email.trim();
  if (trimmed === "") errors.email = "Informe o e-mail.";
  else if (!EMAIL_PATTERN.test(trimmed)) errors.email = "E-mail inválido.";
  if (password === "") errors.password = "Informe a senha.";
  return errors;
}

export function LoginForm({ next, notice = null, initialErrorCode = null }: LoginFormProps) {
  const hydrated = useHydrated();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const { state, submit } = useApiMutation<LoginRequest, LoginResponse>("/api/auth/login");

  const busy = state.status === "submitting" || state.status === "success";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const errors = validateLogin(email, password);
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    const result = await submit({ email: email.trim(), password, next });
    if (result.ok) {
      window.location.assign(toSafeInternalPath(next));
    }
  }

  // Erro de validação do servidor vai para o campo a que se refere; os outros para o alerta.
  let alertMessage: string | null = null;
  const serverFieldErrors: FieldErrors = {};
  if (state.status === "error") {
    if (state.error.code === "VALIDATION_ERROR") {
      if (/e-mail/i.test(state.error.message)) serverFieldErrors.email = state.error.message;
      else serverFieldErrors.password = state.error.message;
    } else {
      alertMessage = state.error.message;
    }
  } else if (state.status === "idle" && initialErrorCode) {
    alertMessage = messageForErrorCode(initialErrorCode);
  }

  return (
    <form
      method="post"
      action="/api/auth/login"
      onSubmit={onSubmit}
      noValidate={hydrated}
      className="flex flex-col gap-4"
    >
      {notice && state.status === "idle" ? (
        <FormStatus>{LOGIN_NOTICE_MESSAGES[notice]}</FormStatus>
      ) : null}
      {alertMessage ? <FormAlert>{alertMessage}</FormAlert> : null}

      <input type="hidden" name="next" value={next} />
      <TextField
        id="login-email"
        name="email"
        label="E-mail"
        type="email"
        value={email}
        onChange={setEmail}
        error={fieldErrors.email ?? serverFieldErrors.email}
        autoComplete="username"
        required
      />
      <TextField
        id="login-password"
        name="password"
        label="Senha"
        type="password"
        value={password}
        onChange={setPassword}
        error={fieldErrors.password ?? serverFieldErrors.password}
        autoComplete="current-password"
        required
      />

      <SubmitButton idleLabel="Entrar" busyLabel="A entrar…" busy={busy} />

      <Link href="/esqueci-senha" className={LINK_CLASS}>
        Esqueci a senha
      </Link>
    </form>
  );
}
