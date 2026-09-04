/**
 * Esquemas Zod (v4) dos corpos das rotas de autenticação. As mensagens são os
 * textos exatos exibidos pela UI (briefing, seção 4.0).
 */
import { z } from "zod";

export const emailField = z
  .string()
  .trim()
  .min(1, "Informe o e-mail.")
  .max(254, "E-mail inválido.")
  .pipe(z.email("E-mail inválido."));

export const passwordField = z
  .string()
  .min(1, "Informe a senha.")
  .max(1024, "Senha demasiado longa.");

export const newPasswordField = z
  .string()
  .min(10, "A senha deve ter pelo menos 10 caracteres.")
  .max(1024, "Senha demasiado longa.");

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

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const resetPasswordSchema = z.object({
  token: z.string().regex(TOKEN_PATTERN),
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
