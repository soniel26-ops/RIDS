/**
 * Verificação real da sessão (o proxy só faz a otimista).
 * - Páginas (Server Components): `requirePageUser` como primeira instrução;
 *   `getCurrentUser` na página de login para redirecionar quem já entrou.
 * - Rotas de API: `authenticateApiRequest(request)` como primeira instrução.
 * O frontend importa daqui apenas getCurrentUser e requirePageUser, e só em page.tsx.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import type { CurrentUser } from "@/shared/types";
import { getAuthService } from "./auth.deps";
import { AuthError, isAuthError } from "./auth.errors";
import { apiErrorResponse, clearSessionCookie, SESSION_COOKIE, withQuery } from "./http";

type CookieResolution =
  { status: "none" } | { status: "invalid" } | { status: "ok"; user: CurrentUser };

async function resolveToken(token: string | undefined): Promise<CookieResolution> {
  if (!token) return { status: "none" };
  const user = await getAuthService().resolveSession(token);
  return user ? { status: "ok", user } : { status: "invalid" };
}

async function resolveFromCookieStore(): Promise<CookieResolution> {
  const store = await cookies();
  return resolveToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * Usuário da sessão atual ou null. Banco indisponível → null (registrado no log), para a
 * página de login continuar a renderizar e o erro aparecer no próprio login (CA-13).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const result = await resolveFromCookieStore();
    return result.status === "ok" ? result.user : null;
  } catch (error) {
    if (isAuthError(error) && error.code === "AUTH_UNAVAILABLE") {
      console.error("getCurrentUser: autenticação indisponível");
      return null;
    }
    throw error;
  }
}

/**
 * Exige sessão válida numa página protegida. Sem cookie → /login?next=...;
 * cookie inválido/expirado → /login?motivo=sessao_expirada&next=... (o cookie não é
 * apagado aqui: não se grava cookie durante a renderização).
 */
export async function requirePageUser(opts: { next: string }): Promise<CurrentUser> {
  const result = await resolveFromCookieStore();
  if (result.status === "ok") return result.user;
  // redirect() lança: fica fora de qualquer try/catch.
  redirect(
    result.status === "none"
      ? withQuery("/login", { next: opts.next })
      : withQuery("/login", { motivo: "sessao_expirada", next: opts.next }),
  );
}

export type ApiAuthResult = { ok: true; user: CurrentUser } | { ok: false; response: NextResponse };

/**
 * Exige sessão válida numa rota de API. Falha → 401 UNAUTHENTICATED com Set-Cookie
 * que apaga rids_session; banco indisponível → 503 AUTH_UNAVAILABLE.
 */
export async function authenticateApiRequest(request: NextRequest): Promise<ApiAuthResult> {
  try {
    const result = await resolveToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (result.status === "ok") return { ok: true, user: result.user };
    return {
      ok: false,
      response: clearSessionCookie(apiErrorResponse(new AuthError("UNAUTHENTICATED"))),
    };
  } catch (error) {
    const authError = isAuthError(error) ? error : new AuthError("AUTH_UNAVAILABLE");
    if (!isAuthError(error)) {
      console.error(
        "authenticateApiRequest falhou",
        error instanceof Error ? error.message : error,
      );
    }
    return { ok: false, response: apiErrorResponse(authError) };
  }
}
