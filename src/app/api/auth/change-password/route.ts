import { NextResponse, type NextRequest } from "next/server";
import { getAuthService } from "@/server/auth/auth.deps";
import {
  assertSameOrigin,
  errorOutcome,
  readAuthBody,
  respondAuth,
  toAuthError,
  validationError,
} from "@/server/auth/http";
import { changePasswordSchema } from "@/server/auth/schemas";
import { authenticateApiRequest } from "@/server/auth/session-guard";
import type { OkResponse } from "@/shared/types";

export const dynamic = "force-dynamic";

const PAGE = "/conta/senha";

/**
 * POST /api/auth/change-password (sessão obrigatória) → 200 { ok: true } ou 303 /conta/senha?ok=1.
 * Erros: 401 UNAUTHENTICATED (cookie apagado), 400 VALIDATION_ERROR, 400 INVALID_CURRENT_PASSWORD,
 * 429 TOO_MANY_ATTEMPTS, 503 AUTH_UNAVAILABLE, 403 FORBIDDEN_ORIGIN. Formulário: 303 /conta/senha?erro=<code>.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) return auth.response;
  try {
    assertSameOrigin(request);
    const parsed = changePasswordSchema.safeParse(await readAuthBody(request));
    if (!parsed.success) throw validationError(parsed.error);

    await getAuthService().changePassword({ userId: auth.user.id, ...parsed.data });
    const body: OkResponse = { ok: true };
    return respondAuth(request, {
      json: NextResponse.json(body, { status: 200 }),
      formRedirect: `${PAGE}?ok=1`,
    });
  } catch (error) {
    const authError = toAuthError(error, "POST /api/auth/change-password");
    return respondAuth(request, errorOutcome(authError, PAGE));
  }
}
