import { NextResponse, type NextRequest } from "next/server";
import { getAuthService } from "@/server/auth/auth.deps";
import {
  assertSameOrigin,
  clearSessionCookie,
  errorOutcome,
  respondAuth,
  SESSION_COOKIE,
  toAuthError,
} from "@/server/auth/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/logout → 204 + cookie apagado (JSON) ou 303 /login (formulário). Idempotente.
 * Erros: 503 AUTH_UNAVAILABLE, 403 FORBIDDEN_ORIGIN. Formulário: 303 /login?erro=<code>.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await getAuthService().logout(request.cookies.get(SESSION_COOKIE)?.value);
    const json = clearSessionCookie(new NextResponse(null, { status: 204 }));
    return respondAuth(request, { json, formRedirect: "/login" });
  } catch (error) {
    const authError = toAuthError(error, "POST /api/auth/logout");
    return respondAuth(request, errorOutcome(authError, "/login"));
  }
}
