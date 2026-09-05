/**
 * Regras de autenticação partilhadas entre a API e a UI: formato do token de
 * redefinição, limites da senha e lista de códigos de erro. Fonte única para
 * `src/server/auth/schemas.ts`, `src/server/auth/tokens.ts` e os componentes de auth.
 * Alterar este arquivo exige aviso no resumo do engenheiro (ver CLAUDE.md).
 */
import { AUTH_ERROR_MESSAGES, type AuthErrorCode } from "./types";

/** Token opaco: 32 bytes aleatórios em base64url (43 caracteres). */
export const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 1024;
export const PASSWORD_TOO_SHORT_MESSAGE = "A senha deve ter pelo menos 10 caracteres.";

/** Todos os códigos de `AuthErrorCode`: os que têm mensagem fixa mais VALIDATION_ERROR. */
export const AUTH_ERROR_CODES: readonly AuthErrorCode[] = [
  "VALIDATION_ERROR",
  ...(Object.keys(AUTH_ERROR_MESSAGES) as AuthErrorCode[]),
];
