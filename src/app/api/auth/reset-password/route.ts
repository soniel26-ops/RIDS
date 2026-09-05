import { NextResponse, type NextRequest } from "next/server";
import { getAuthService } from "@/server/auth/auth.deps";
import { AuthError } from "@/server/auth/auth.errors";
import {
  assertSameOrigin,
  errorOutcome,
  readAuthBody,
  respondAuth,
  toAuthError,
  validationError,
} from "@/server/auth/http";
import { resetPasswordSchema } from "@/server/auth/schemas";
import { isTokenFormat } from "@/server/auth/tokens";
import type { OkResponse } from "@/shared/types";

export const dynamic = "force-dynamic";

const PAGE = "/redefinir-senha";

/**
 * POST /api/auth/reset-password → 200 { ok: true } ou 303 /login?motivo=senha_redefinida.
 * Erros: 400 INVALID_RESET_TOKEN (token fora do formato, expirado, usado ou substituído),
 * 400 VALIDATION_ERROR, 503 AUTH_UNAVAILABLE, 403 FORBIDDEN_ORIGIN.
 * Formulário: 303 /redefinir-senha?token=<token>&erro=<code>.
 */
export async function POST(request: NextRequest) {
  let token: string | undefined;
  try {
    assertSameOrigin(request);
    const raw = await readAuthBody(request);
    // Token fora do formato é INVALID_RESET_TOKEN, não VALIDATION_ERROR (sem detalhe, CA-29).
    if (!isTokenFormat(raw.token)) throw new AuthError("INVALID_RESET_TOKEN");
    token = raw.token;
    const parsed = resetPasswordSchema.safeParse(raw);
    if (!parsed.success) throw validationError(parsed.error);

    await getAuthService().resetPassword(parsed.data);
    const body: OkResponse = { ok: true };
    return respondAuth(request, {
      json: NextResponse.json(body, { status: 200 }),
      formRedirect: "/login?motivo=senha_redefinida",
    });
  } catch (error) {
    const authError = toAuthError(error, "POST /api/auth/reset-password");
    return respondAuth(request, errorOutcome(authError, PAGE, { token }));
  }
}
