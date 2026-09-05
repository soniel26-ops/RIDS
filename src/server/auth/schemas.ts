/**
 * Esquemas Zod (v4) dos corpos das rotas de autenticação. As mensagens são os
 * textos exatos exibidos pela UI (briefing, seção 4.0).
 */
import { z } from "zod";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_TOO_SHORT_MESSAGE,
  RESET_TOKEN_PATTERN,
} from "@/shared/auth-rules";

export const emailField = z
  .string()
  .trim()
  .min(1, "Informe o e-mail.")
  .max(254, "E-mail inválido.")
  .pipe(z.email("E-mail inválido."));

export const passwordField = z
  .string()
  .min(1, "Informe a senha.")
  .max(PASSWORD_MAX_LENGTH, "Senha demasiado longa.");

export const newPasswordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, PASSWORD_TOO_SHORT_MESSAGE)
  .max(PASSWORD_MAX_LENGTH, "Senha demasiado longa.");

export const loginSchema = z.object({
  email: emailField,
  password: passwordField,
  next: z.string().max(2048).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: passwordField,
  newPassword: newPasswordField,
});

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = z.object({
  token: z.string().regex(RESET_TOKEN_PATTERN),
  newPassword: newPasswordField,
});

export const roleSchema = z.enum(["OWNER", "ADMIN", "MARKETING"]);

/** Criação de conta (CLI) e usuário de teste (rota de desenvolvimento). */
export const createUserSchema = z.object({
  email: emailField,
  password: newPasswordField,
  role: roleSchema,
});

export const testUserSchema = z.object({
  email: emailField,
  password: newPasswordField,
  role: roleSchema.default("OWNER"),
});

/** Mensagem do primeiro problema, para VALIDATION_ERROR. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}
