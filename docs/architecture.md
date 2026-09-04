# Arquitetura do RIDS

## Visão geral

Um único painel Next.js gere N lojas Shopify. O processo web recebe pedidos do
painel e webhooks da Shopify; tudo que é pesado, repetível ou depende de serviço
externo vai para filas BullMQ processadas por workers.

```
Painel (React) ──► /api/* (rotas finas) ──► serviços (src/server) ──► PostgreSQL
                                                   │
Shopify ──webhooks──► /api/webhooks/shopify ──► WebhookEvent ──► fila ──► worker ──► Shopify Admin API
```

## Modelo de dados (prisma/schema.prisma)

- **Store**: o tenant. `domain` (público), `shopifyDomain` (*.myshopify.com),
  `accessTokenEncrypted`, `timezone`, `currency`, `isActive`.
- **WebhookEvent**: uma linha por entrega de webhook, chave única `webhookId`.
  Garante idempotência e dá auditoria.

Toda tabela futura (Product, Order, Supplier, SupplierOrder...) tem `storeId`
obrigatório e índice começando por `storeId`.

## Lojas registradas

| Domínio          | Nome          | Estado                    |
| ---------------- | ------------- | ------------------------- |
| sonielsupply.com | Soniel Supply | registrada, não conectada |
| sonielparis.fr   | Soniel Paris  | registrada, não conectada |

Suposição a confirmar: ambas em `Europe/Paris` e `EUR`.

## Conexão de uma loja (a construir)

1. Uma app Shopify (Partner Dashboard) serve todas as lojas. Credenciais em
   `SHOPIFY_API_KEY` e `SHOPIFY_API_SECRET`.
2. Fluxo OAuth por loja gera um token offline. O token é cifrado com
   `encryptSecret` e gravado em `Store.accessTokenEncrypted`.
3. Na mesma conexão, o RIDS registra os webhooks necessários (`orders/create`,
   `orders/paid`, `orders/cancelled`, `products/update`, `app/uninstalled`).
4. Chamadas à Shopify usam `graphqlClientFor(store)` em `src/server/shopify/client.ts`.

## Webhooks

- Rota única `/api/webhooks/shopify` (a construir). Verifica o HMAC com o segredo
  da app antes de ler o corpo.
- Identifica a loja pelo cabeçalho `X-Shopify-Shop-Domain`.
- Grava `WebhookEvent` com `webhookId`; se já existir, responde 200 e não faz nada.
- Enfileira `webhook-process` com `jobId = webhookId`. O worker processa e marca
  `processedAt` ou `error`.

## Filas (src/server/jobs/queue.ts)

- `shopify-sync`: sincronizações de catálogo e preços por loja.
- `webhook-process`: processamento de webhooks.
- Retry exponencial, 5 tentativas. `jobId` determinístico sempre.

## Segurança

- Segredos em repouso: AES-256-GCM (`src/server/security/crypto.ts`), chave em `ENCRYPTION_KEY`.
- Segredos em arquivos: bloqueados pelo hook `.claude/hooks/block-secrets.sh`.
- Logs: nunca payload bruto, token ou dado de cliente.

## Pendências e decisões em aberto

- **Autenticação do painel.** Hoje `/api/stores` e a página inicial não exigem
  login. Precisa ser a primeira funcionalidade antes de qualquer deploy.
- **Fornecedores.** O dono usa hoje: CJ Dropshipping, DSers (AliExpress), Spocket,
  "Splite" e "Change2Brand" (os dois últimos ainda por identificar; pedir links).
  Vários deles já operam como apps Shopify que publicam produtos e cumprem pedidos
  dentro da própria loja. Hipótese de desenho a confirmar: a Shopify é o hub, o RIDS
  observa pedidos e cumprimentos por webhook e só integra diretamente a API de um
  fornecedor (CJ tem API pública) quando precisar de custo, stock ou pedido automático.
  Define o modelo `Supplier` e o vínculo produto↔fornecedor.
- **Infraestrutura.** Onde ficam PostgreSQL e Redis (local, Docker, gerenciado)?
- **Fuso e moeda** da sonielsupply.com a confirmar.
