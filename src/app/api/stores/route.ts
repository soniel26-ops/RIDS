import { NextResponse, type NextRequest } from "next/server";
import { authenticateApiRequest } from "@/server/auth/session-guard";
import { prisma } from "@/server/db";
import { createStoreService } from "@/server/stores/store.service";
import type { ApiError, StoreSummary } from "@/shared/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/stores → StoreSummary[]
 * Exige sessão (401 UNAUTHENTICATED sem ela). Lista todas as lojas para qualquer cargo (CA-19).
 * Nunca inclui tokens.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const stores: StoreSummary[] = await createStoreService(prisma).listStores();
    return NextResponse.json(stores);
  } catch (error) {
    console.error("GET /api/stores falhou", error instanceof Error ? error.message : error);
    const body: ApiError = {
      error: { code: "STORES_UNAVAILABLE", message: "Não foi possível listar as lojas." },
    };
    return NextResponse.json(body, { status: 503 });
  }
}
