/**
 * Cliente da Shopify Admin API, um por loja.
 * Toda chamada à Shopify passa por aqui: é onde o token é decifrado e onde,
 * no futuro, o controle de limite de chamadas por loja será aplicado.
 * Chamadas em massa não usam este módulo diretamente: vão para a fila (src/server/jobs).
 */
import { ApiVersion, shopifyApi, Session, type Shopify } from "@shopify/shopify-api";
import "@shopify/shopify-api/adapters/node";
import { decryptSecret } from "@/server/security/crypto";

let instance: Shopify | undefined;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não definida.`);
  return value;
}

/** Instância única da biblioteca, configurada a partir do ambiente. */
export function getShopifyApi(): Shopify {
  if (instance) return instance;
  instance = shopifyApi({
    apiKey: requireEnv("SHOPIFY_API_KEY"),
    apiSecretKey: requireEnv("SHOPIFY_API_SECRET"),
    scopes: requireEnv("SHOPIFY_SCOPES")
      .split(",")
      .map((s) => s.trim()),
    hostName: requireEnv("APP_HOST").replace(/^https?:\/\//, ""),
    apiVersion: ApiVersion.July26,
    isEmbeddedApp: false,
  });
  return instance;
}

export interface ConnectedStore {
  id: string;
  shopifyDomain: string;
  accessTokenEncrypted: string;
}

/** Sessão offline da loja, com o token decifrado apenas em memória. */
export function buildStoreSession(store: ConnectedStore): Session {
  return new Session({
    id: `offline_${store.shopifyDomain}`,
    shop: store.shopifyDomain,
    state: "offline",
    isOnline: false,
    accessToken: decryptSecret(store.accessTokenEncrypted),
  });
}

/** Cliente GraphQL da Admin API para uma loja específica. */
export function graphqlClientFor(store: ConnectedStore) {
  const shopify = getShopifyApi();
  return new shopify.clients.Graphql({ session: buildStoreSession(store) });
}
