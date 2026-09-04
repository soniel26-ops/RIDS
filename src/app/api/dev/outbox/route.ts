import { NextResponse, type NextRequest } from "next/server";
import { AuthError } from "@/server/auth/auth.errors";
import { apiErrorResponse, toAuthError } from "@/server/auth/http";
import { readCapturedMessages } from "@/server/auth/mail/captured-transport";
import { getRedisConnection } from "@/server/jobs/queue";

export const dynamic = "force-dynamic";

/**
 * GET /api/dev/outbox?to=<e-mail> → 200 { messages: CapturedMessage[] } (mais recente primeiro).
 * Só fora de produção: em produção responde 404 NOT_FOUND antes de qualquer coisa.
 * Erros: 400 VALIDATION_ERROR (`to` ausente), 503 AUTH_UNAVAILABLE (Redis fora).
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return apiErrorResponse(new AuthError("NOT_FOUND"));
  }
  try {
    const to = request.nextUrl.searchParams.get("to")?.trim() ?? "";
    if (!to) throw new AuthError("VALIDATION_ERROR", "Informe o e-mail.");
    const messages = await readCapturedMessages(getRedisConnection(), to);
    return NextResponse.json({ messages });
  } catch (error) {
    return apiErrorResponse(toAuthError(error, "GET /api/dev/outbox"));
  }
}
