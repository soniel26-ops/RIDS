import { NextResponse, type NextRequest } from "next/server";
import { getAuthService } from "@/server/auth/auth.deps";
import { AuthError } from "@/server/auth/auth.errors";
import { apiErrorResponse, readAuthBody, toAuthError, validationError } from "@/server/auth/http";
import { testUserSchema } from "@/server/auth/schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/dev/test-user { email, password, role? = "OWNER" } → 200 { id, email, role }.
 * Cria ou repõe o usuário (hash e cargo), apaga sessões e tokens dele e zera os contadores.
 * Só fora de produção: em produção responde 404 NOT_FOUND antes de qualquer coisa.
 * Erros: 400 VALIDATION_ERROR, 503 AUTH_UNAVAILABLE.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return apiErrorResponse(new AuthError("NOT_FOUND"));
  }
  try {
    const parsed = testUserSchema.safeParse(await readAuthBody(request));
    if (!parsed.success) throw validationError(parsed.error);
    const user = await getAuthService().upsertTestUser(parsed.data);
    return NextResponse.json(user, { status: 200 });
  } catch (error) {
    return apiErrorResponse(toAuthError(error, "POST /api/dev/test-user"));
  }
}
