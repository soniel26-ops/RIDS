/**
 * E-mail do link de redefinição. Texto simples, sem hora absoluta (evita fuso),
 * sem nome, sem senha. O token em claro só existe aqui e no e-mail entregue.
 */
import type { MailMessage } from "./transport";

export const RESET_EMAIL_SUBJECT = "Redefinir a senha do RIDS";

/** `${scheme}://${APP_HOST}/redefinir-senha?token=<token>`; https só em produção. */
export function buildResetUrl(token: string, env: NodeJS.ProcessEnv = process.env): string {
  const host = (env.APP_HOST ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!host) throw new Error("APP_HOST não definida.");
  const scheme = env.NODE_ENV === "production" ? "https" : "http";
  return `${scheme}://${host}/redefinir-senha?token=${encodeURIComponent(token)}`;
}

export function buildResetEmail(opts: { to: string; resetUrl: string }): MailMessage {
  const text = [
    "Recebemos um pedido para redefinir a senha da sua conta no RIDS.",
    "",
    "Abra este link para definir uma nova senha:",
    opts.resetUrl,
    "",
    "O link é válido por 1 hora e só pode ser usado uma vez.",
    "Se não pediu esta redefinição, ignore este e-mail; a sua senha continua a mesma.",
  ].join("\n");
  return { to: opts.to, subject: RESET_EMAIL_SUBJECT, text };
}
