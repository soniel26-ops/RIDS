/**
 * Leitura dos parâmetros de query das páginas de autenticação (Server Components) e
 * mensagens fixas do caminho sem JavaScript (?erro=). Sem dependências do servidor.
 */
import { AUTH_ERROR_CODES, RESET_TOKEN_PATTERN } from "@/shared/auth-rules";
import { AUTH_ERROR_MESSAGES, type AuthErrorCode, type LoginNotice } from "@/shared/types";

export type SearchParamValue = string | string[] | undefined;
export type SearchParams = Record<string, SearchParamValue>;

/** Primeiro valor de um parâmetro (o Next devolve array quando repetido). */
export function firstParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseAuthErrorCode(value: SearchParamValue): AuthErrorCode | null {
  const code = firstParam(value);
  return code && (AUTH_ERROR_CODES as readonly string[]).includes(code)
    ? (code as AuthErrorCode)
    : null;
}

export function parseLoginNotice(value: SearchParamValue): LoginNotice | null {
  const motivo = firstParam(value);
  return motivo === "sessao_expirada" || motivo === "senha_redefinida" ? motivo : null;
}

/** `?ok=1`, `?enviado=1`: qualquer valor presente conta como verdadeiro. */
export function parseFlag(value: SearchParamValue): boolean {
  const flag = firstParam(value);
  return flag !== undefined && flag !== "" && flag !== "0";
}

/** Token do link de redefinição no formato partilhado com o backend (`RESET_TOKEN_PATTERN`). */
export function parseResetToken(value: SearchParamValue): string | null {
  const token = firstParam(value);
  return token && RESET_TOKEN_PATTERN.test(token) ? token : null;
}

/** Mensagem genérica quando o servidor recusou um campo mas o texto Zod não chegou (?erro=VALIDATION_ERROR). */
export const GENERIC_VALIDATION_MESSAGE = "Verifique os campos e tente de novo.";

export const LOGIN_NOTICE_MESSAGES: Record<LoginNotice, string> = {
  sessao_expirada: "A sua sessão terminou. Entre de novo.",
  senha_redefinida: "Senha redefinida. Entre com a nova senha.",
};

/** Texto a mostrar para um código vindo em ?erro= (caminho sem JavaScript). */
export function messageForErrorCode(code: AuthErrorCode): string {
  return code === "VALIDATION_ERROR" ? GENERIC_VALIDATION_MESSAGE : AUTH_ERROR_MESSAGES[code];
}
