import { describe, expect, it, vi } from "vitest";
import { createStoreService, type StoreRepository } from "./store.service";

const rows = [
  {
    id: "s2",
    domain: "sonielparis.fr",
    name: "Soniel Paris",
    shopifyDomain: null,
    timezone: "Europe/Paris",
    currency: "EUR",
    isActive: true,
    accessTokenEncrypted: null,
  },
  {
    id: "s1",
    domain: "sonielsupply.com",
    name: "Soniel Supply",
    shopifyDomain: "soniel-supply.myshopify.com",
    timezone: "Europe/Paris",
    currency: "EUR",
    isActive: true,
    accessTokenEncrypted: "cifrado==",
  },
];

function fakeDb(): StoreRepository & {
  store: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
} {
  return {
    store: {
      findMany: vi.fn(async () => rows),
      findUnique: vi.fn(
        async ({ where }: { where: { domain: string } }) =>
          rows.find((r) => r.domain === where.domain) ?? null,
      ),
    },
  };
}

describe("store.service", () => {
  it("lista lojas sem expor o token", async () => {
    const service = createStoreService(fakeDb());
    const stores = await service.listStores();
    expect(stores).toHaveLength(2);
    for (const store of stores) {
      expect(store).not.toHaveProperty("accessTokenEncrypted");
    }
  });

  it("marca isConnected conforme a presença do token", async () => {
    const service = createStoreService(fakeDb());
    const stores = await service.listStores();
    expect(stores.find((s) => s.domain === "sonielsupply.com")?.isConnected).toBe(true);
    expect(stores.find((s) => s.domain === "sonielparis.fr")?.isConnected).toBe(false);
  });

  it("filtra por lojas ativas quando pedido", async () => {
    const db = fakeDb();
    await createStoreService(db).listStores({ onlyActive: true });
    expect(db.store.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it("normaliza o domínio ao buscar", async () => {
    const db = fakeDb();
    const store = await createStoreService(db).getStoreByDomain("  SonielParis.FR ");
    expect(store?.domain).toBe("sonielparis.fr");
  });

  it("devolve null para loja desconhecida", async () => {
    const store = await createStoreService(fakeDb()).getStoreByDomain("outra.com");
    expect(store).toBeNull();
  });
});
