/**
 * Verificação otimista de sessão (Next 16 `proxy`, antigo middleware). Só olha se o
 * cookie rids_session existe; não valida no banco (a verificação real é feita por
 * requirePageUser nas páginas e authenticateApiRequest nas rotas).
 * Caminho protegido sem cookie: /api/* → 401 JSON; páginas → 307 /login?next=<caminho>.
 */
import { NextResponse, type NextRequest } from "next/server";
import { toSafeInternalPath } from "@/shared/safe-path";
import { AUTH_ERROR_MESSAGES, type ApiError } from "@/shared/types";

/** Nome do cookie de sessão. Duplicado de src/server/auth/http.ts de propósito: o proxy não importa módulos do servidor. */
const SESSION_COOKIE = "rids_session";

export const PUBLIC_PATHS = [
  "/login",
  "/esqueci-senha",
  "/redefinir-senha",
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
] as const;

/** Rotas de desenvolvimento: públicas só fora de produção (as próprias rotas respondem 404 em produção). */
const DEV_PREFIX = "/api/dev/";

export function isPublicPath(pathname: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)))
    return true;
  if (env.NODE_ENV !== "production" && pathname.startsWith(DEV_PREFIX)) return true;
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    const body: ApiError = {
      error: { code: "UNAUTHENTICATED", message: AUTH_ERROR_MESSAGES.UNAUTHENTICATED },
    };
    return NextResponse.json(body, { status: 401 });
  }

  // O Location TEM de ser uma URL absoluta com a mesma origem de request.url: o adapter do Next
  // (server/web/adapter.js) faz `new NextURL(location)` sem base — um caminho relativo cru lança
  // "Invalid URL" e vira 500 — e, quando o host coincide com o de request.url, ele próprio reescreve
  // o Location para relativo (`/login?next=...`). Assim o navegador nunca é enviado para outro host,
  // mesmo atrás de reverse proxy ou com 127.0.0.1 vs localhost. Não usar o cabeçalho Host aqui:
  // quebraria essa coincidência e o redirecionamento sairia absoluto para outro host.
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", toSafeInternalPath(`${pathname}${search}`));
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Tudo exceto _next/static, _next/image, favicon.ico e caminhos com extensão de arquivo.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.[A-Za-z0-9]+$).*)"],
};
