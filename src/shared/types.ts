/**
 * Contratos compartilhados entre backend e frontend.
 * Alterar este arquivo exige aviso no resumo do engenheiro (ver CLAUDE.md).
 */

/** Loja como exposta pela API. Nunca inclui tokens ou segredos. */
export interface StoreSummary {
  id: string;
  domain: string;
  name: string;
  shopifyDomain: string | null;
  timezone: string;
  currency: string;
  isActive: boolean;
  /** true quando a loja tem token de acesso salvo. */
  isConnected: boolean;
}

export interface ApiError {
  error: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// Autenticação do painel (funcionalidade login-painel)
// ---------------------------------------------------------------------------

/** Cargo da pessoa no painel. Espelha o enum Prisma UserRole; não importar o Prisma aqui. */
export type UserRole = "OWNER" | "ADMIN" | "MARKETING";

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "Proprietário",
  ADMIN: "Admin",
  MARKETING: "Marketing",
};

/** Pessoa autenticada, como exposta à UI. Nunca inclui hash, tokens ou sessão. */
export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
}

export type AuthErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_CREDENTIALS"
  | "TOO_MANY_ATTEMPTS"
  | "UNAUTHENTICATED"
  | "INVALID_CURRENT_PASSWORD"
  | "INVALID_RESET_TOKEN"
  | "MAIL_UNAVAILABLE"
  | "AUTH_UNAVAILABLE"
  | "FORBIDDEN_ORIGIN"
  | "NOT_FOUND";

/** Mensagens fixas por código (tabela da seção 4.0 do briefing), usadas pela API e pelas páginas no caminho sem JavaScript (?erro=). */
export const AUTH_ERROR_MESSAGES: Record<Exclude<AuthErrorCode, "VALIDATION_ERROR">, string> = {
  INVALID_CREDENTIALS: "E-mail ou senha incorretos",
  TOO_MANY_ATTEMPTS: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  UNAUTHENTICATED: "Sessão necessária.",
  INVALID_CURRENT_PASSWORD: "Senha atual incorreta",
  INVALID_RESET_TOKEN: "Este link é inválido ou expirou; peça um novo",
  MAIL_UNAVAILABLE: "Não foi possível enviar agora, tente mais tarde.",
  AUTH_UNAVAILABLE: "O serviço está indisponível de momento. Tente mais tarde.",
  FORBIDDEN_ORIGIN: "Origem do pedido não permitida.",
  NOT_FOUND: "Não encontrado.",
};

/** Motivos de aviso na tela de login (?motivo=). */
export type LoginNotice = "sessao_expirada" | "senha_redefinida";

export interface LoginRequest {
  email: string;
  password: string;
  next?: string;
}
export interface LoginResponse {
  user: CurrentUser;
}
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
export interface ForgotPasswordRequest {
  email: string;
}
export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}
export interface OkResponse {
  ok: true;
}
