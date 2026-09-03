import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { createStoreService } from "@/server/stores/store.service";
import type { ApiError, StoreSummary } from "@/shared/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/stores → StoreSummary[]
 * Lista as lojas geridas. Nunca inclui tokens.
 * Pendente (docs/architecture.md): autenticação do painel.
 */
export async function GET() {
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
