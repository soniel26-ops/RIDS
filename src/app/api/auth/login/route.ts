import { NextResponse, type NextRequest } from "next/server";
import { getAuthService } from "@/server/auth/auth.deps";
import {
  assertSameOrigin,
  errorOutcome,
  readAuthBody,
  respondAuth,
  setSessionCookie,
  toAuthError,
  validationError,
} from "@/server/auth/http";
import { loginSchema } from "@/server/auth/schemas";
import { toSafeInternalPath } from "@/shared/safe-path";
import type { LoginResponse } from "@/shared/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login → 200 { user } + cookie rids_session (JSON) ou 303 <next> (formulário).
 * Erros: 400 VALIDATION_ERROR, 401 INVALID_CREDENTIALS, 429 TOO_MANY_ATTEMPTS,
 * 503 AUTH_UNAVAILABLE, 403 FORBIDDEN_ORIGIN. Formulário: 303 /login?erro=<code>&next=<next>.
 */
export async function POST(request: NextRequest) {
  let next = "/";
  try {
    assertSameOrigin(request);
    const raw = await readAuthBody(request);
    next = toSafeInternalPath(typeof raw.next === "string" ? raw.next : undefined);
    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) throw validationError(parsed.error);

    const result = await getAuthService().login({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    const body: LoginResponse = { user: result.user };
    const json = setSessionCookie(
      NextResponse.json(body, { status: 200 }),
      result.token,
      result.expiresAt,
    );
    return respondAuth(request, { json, formRedirect: next });
  } catch (error) {
    const authError = toAuthError(error, "POST /api/auth/login");
    return respondAuth(
      request,
      errorOutcome(authError, "/login", { next: next === "/" ? undefined : next }),
    );
  }
}
