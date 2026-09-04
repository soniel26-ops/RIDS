/**
 * Cliente HTTP mínimo para a API do painel. Todos os hooks passam por aqui.
 *
 * - Devolve sempre um `ApiResult` (nunca lança): rede fora ou corpo não-JSON viram
 *   `AUTH_UNAVAILABLE` com mensagem genérica, sem detalhe técnico.
 * - Resposta com `error.code === "UNAUTHENTICATED"` (e só por esse código, nunca pelo
 *   status 401, porque o login devolve 401 INVALID_CREDENTIALS) leva ao login com o
 *   aviso de sessão terminada e devolve uma promessa que nunca resolve: quem chamou fica
 *   em "carregando" enquanto o navegador navega (CA-11).
 */
import { AUTH_ERROR_MESSAGES, type ApiError, type LoginNotice } from "@/shared/types";

export type ApiErrorBody = ApiError["error"];

export type ApiResult<T> =
  { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiErrorBody };

/** Mensagem genérica quando a resposta não é uma ApiError reconhecível. */
export const GENERIC_UNAVAILABLE_MESSAGE = AUTH_ERROR_MESSAGES.AUTH_UNAVAILABLE;

function unavailable(status: number): ApiResult<never> {
  return {
    ok: false,
    status,
    error: { code: "AUTH_UNAVAILABLE", message: GENERIC_UNAVAILABLE_MESSAGE },
  };
}

function isApiErrorBody(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null) return false;
  const error = (value as { error?: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

/**
 * Leva ao login com o aviso do motivo e o caminho atual em `next`, para voltar depois.
 * Exportada à parte para poder ser observada nos testes (window.location é substituível).
 */
export function redirectToLogin(motivo: Extract<LoginNotice, "sessao_expirada">): void {
  const { pathname, search } = window.location;
  const next = encodeURIComponent(`${pathname}${search}`);
  // Navegação completa de propósito (briefing 5.1): a página de login é um Server Component
  // que relê o cookie; o router do cliente não serve fora de um componente React.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?motivo=${motivo}&next=${next}`);
}

/** Promessa que nunca resolve: o chamador fica em "carregando" durante o redirecionamento. */
function never<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<ApiResult<T>> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(input, { ...init, headers });
  } catch {
    // Rede fora ou pedido abortado. Quem abortou ignora o resultado (verifica o signal).
    return unavailable(0);
  }

  let body: unknown = undefined;
  if (response.status !== 204) {
    try {
      body = await response.json();
    } catch {
      return unavailable(response.status);
    }
  }

  if (response.ok) {
    return { ok: true, status: response.status, data: body as T };
  }

  if (!isApiErrorBody(body)) return unavailable(response.status);

  if (body.error.code === "UNAUTHENTICATED") {
    redirectToLogin("sessao_expirada");
    return never<ApiResult<T>>();
  }

  return { ok: false, status: response.status, error: body.error };
}
