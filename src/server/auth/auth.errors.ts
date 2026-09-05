/**
 * Erro controlado da autenticação. Toda falha prevista do domínio de auth é uma
 * AuthError com um AuthErrorCode e um status HTTP; a rota converte em ApiError.
 * Erros internos (banco, Redis, e-mail) nunca chegam brutos ao cliente: são
 * mapeados para AUTH_UNAVAILABLE / MAIL_UNAVAILABLE com mensagem fixa.
 */
import { AUTH_ERROR_MESSAGES, type AuthErrorCode } from "@/shared/types";

export const AUTH_ERROR_STATUS: Record<AuthErrorCode, number> = {
  VALIDATION_ERROR: 400,
  INVALID_CREDENTIALS: 401,
  TOO_MANY_ATTEMPTS: 429,
  UNAUTHENTICATED: 401,
  INVALID_CURRENT_PASSWORD: 400,
  INVALID_RESET_TOKEN: 400,
  MAIL_UNAVAILABLE: 503,
  AUTH_UNAVAILABLE: 503,
  FORBIDDEN_ORIGIN: 403,
  NOT_FOUND: 404,
};

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;

  /**
   * `message` só é necessário para VALIDATION_ERROR (mensagem do primeiro problema Zod);
   * os outros códigos usam o texto fixo de AUTH_ERROR_MESSAGES.
   */
  constructor(code: AuthErrorCode, message?: string) {
    super(
      message ?? (code === "VALIDATION_ERROR" ? "Dados inválidos." : AUTH_ERROR_MESSAGES[code]),
    );
    this.name = "AuthError";
    this.code = code;
    this.status = AUTH_ERROR_STATUS[code];
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

/** Só o script de criação de contas usa isto; não é um erro de API. */
export class EmailAlreadyInUseError extends Error {
  constructor() {
    super("já existe uma conta com este e-mail");
    this.name = "EmailAlreadyInUseError";
  }
}
