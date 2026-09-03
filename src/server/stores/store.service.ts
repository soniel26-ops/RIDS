/**
 * Serviço de lojas. Único ponto que lê a tabela Store.
 * Nunca devolve accessTokenEncrypted para fora deste módulo.
 */
import type { StoreSummary } from "@/shared/types";

/** Subconjunto do Prisma que o serviço usa. Facilita testes sem banco. */
export interface StoreRepository {
  store: {
    findMany(args: {
      where?: { isActive?: boolean };
      orderBy: { name: "asc" };
      select: typeof STORE_SUMMARY_SELECT;
    }): Promise<StoreRow[]>;
    findUnique(args: {
      where: { domain: string };
      select: typeof STORE_SUMMARY_SELECT;
    }): Promise<StoreRow | null>;
  };
}

export const STORE_SUMMARY_SELECT = {
  id: true,
  domain: true,
  name: true,
  shopifyDomain: true,
  timezone: true,
  currency: true,
  isActive: true,
  accessTokenEncrypted: true,
} as const;

type StoreRow = {
  id: string;
  domain: string;
  name: string;
  shopifyDomain: string | null;
  timezone: string;
  currency: string;
  isActive: boolean;
  accessTokenEncrypted: string | null;
};

function toSummary(row: StoreRow): StoreSummary {
  const { accessTokenEncrypted, ...rest } = row;
  return { ...rest, isConnected: accessTokenEncrypted !== null && accessTokenEncrypted !== "" };
}

export function createStoreService(db: StoreRepository) {
  return {
    async listStores(options: { onlyActive?: boolean } = {}): Promise<StoreSummary[]> {
      const rows = await db.store.findMany({
        where: options.onlyActive ? { isActive: true } : undefined,
        orderBy: { name: "asc" },
        select: STORE_SUMMARY_SELECT,
      });
      return rows.map(toSummary);
    },

    async getStoreByDomain(domain: string): Promise<StoreSummary | null> {
      const row = await db.store.findUnique({
        where: { domain: domain.trim().toLowerCase() },
        select: STORE_SUMMARY_SELECT,
      });
      return row ? toSummary(row) : null;
    },
  };
}

export type StoreService = ReturnType<typeof createStoreService>;
