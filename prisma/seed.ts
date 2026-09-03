/**
 * Seed inicial: registra as lojas geridas pelo RIDS, apenas pelo domínio.
 * Nenhuma credencial é escrita aqui. Tokens entram só pelo fluxo de conexão
 * (ver docs/architecture.md) e ficam cifrados na coluna accessTokenEncrypted.
 *
 * Suposição a confirmar: ambas as lojas em Europe/Paris e EUR.
 */
import "dotenv/config";
import { prisma } from "../src/server/db";

const STORES = [
  { domain: "sonielsupply.com", name: "Soniel Supply", timezone: "Europe/Paris", currency: "EUR" },
  { domain: "sonielparis.fr", name: "Soniel Paris", timezone: "Europe/Paris", currency: "EUR" },
];

async function main() {
  for (const store of STORES) {
    await prisma.store.upsert({
      where: { domain: store.domain },
      update: { name: store.name, timezone: store.timezone, currency: store.currency },
      create: store,
    });
    console.log(`loja registrada: ${store.domain}`);
  }
}

main()
  .catch((error) => {
    console.error("seed falhou:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
