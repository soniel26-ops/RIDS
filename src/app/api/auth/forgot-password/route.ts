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
import { forgotPasswordSchema } from "@/server/auth/schemas";
import type { OkResponse } from "@/shared/types";

export const dynamic = "force-dynamic";

const PAGE = "/esqueci-senha";

/**
 * POST /api/auth/forgot-password → 200 { ok: true } (exista a conta ou não) ou 303 /esqueci-senha?enviado=1.
 * Erros: 400 VALIDATION_ERROR, 429 TOO_MANY_ATTEMPTS, 503 MAIL_UNAVAILABLE, 503 AUTH_UNAVAILABLE,
 * 403 FORBIDDEN_ORIGIN. Formulário: 303 /esqueci-senha?erro=<code>.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const parsed = forgotPasswordSchema.safeParse(await readAuthBody(request));
    if (!parsed.success) throw validationError(parsed.error);

    await getAuthService().requestPasswordReset({ email: parsed.data.email });
    const body: OkResponse = { ok: true };
    return respondAuth(request, {
      json: NextResponse.json(body, { status: 200 }),
      formRedirect: `${PAGE}?enviado=1`,
    });
  } catch (error) {
    const authError = toAuthError(error, "POST /api/auth/forgot-password");
    return respondAuth(request, errorOutcome(authError, PAGE));
  }
}
