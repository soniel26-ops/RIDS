# Descobertas do pesquisador

**Funcionalidade:** Login do painel: só pessoas autorizadas acessam o RIDS (páginas e `/api/*`), a começar pelo dono das lojas.

Resumo em uma linha: o repositório não tem nenhum código de autenticação, sessão, usuário ou proxy; o que existe é um painel de uma página, duas rotas GET públicas, um serviço de lojas, um helper de cifra e a infraestrutura de testes. A documentação local do Next 16 descreve os mecanismos disponíveis (proxy, `cookies()`, Route Handlers, Server Actions, `unauthorized()`), com várias ressalvas relevantes listadas na seção 5.

---

## 1. Arquivos relevantes

### Código do projeto

| Arquivo                                               | O que faz                                             | Por que importa                                                                                                                   |
| ----------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                                           | Livro de regras                                       | Define escopos por pasta, regra de rotas finas, `ApiError`, segredos, "nenhuma consulta sem storeId"                              |
| `docs/architecture.md:65-68`                          | Arquitetura                                           | Declara explicitamente "Autenticação do painel" como pendência número um antes de qualquer deploy                                 |
| `src/app/api/stores/route.ts:13`                      | `GET /api/stores`                                     | Único endpoint de dados; comentário na linha 11 diz "Pendente: autenticação do painel". Padrão de rota fina + `ApiError` a seguir |
| `src/app/api/health/route.ts:6`                       | `GET /api/health`                                     | Comentário na linha 5: "Sem banco, sem auth". É a URL de prontidão do Playwright (ver seção 6)                                    |
| `src/app/page.tsx:3`                                  | Página inicial (Server Component)                     | A única página; renderiza `StoreList`. Hoje não há verificação nenhuma                                                            |
| `src/app/layout.tsx:20`                               | Root layout                                           | Único layout. A doc do Next desaconselha checagem de auth em layouts (seção 5)                                                    |
| `src/hooks/useStores.ts:12`                           | Hook que chama `/api/stores`                          | Linha 19-21: em resposta não-ok lê `ApiError` e mostra a mensagem. Não há tratamento de 401/redirecionamento                      |
| `src/components/StoreList.tsx:26`                     | Lista de lojas                                        | Molde dos quatro estados (carregando, erro, vazio, sucesso)                                                                       |
| `src/server/stores/store.service.ts:49`               | `createStoreService(db)`                              | Molde de serviço com injeção de dependência e interface de repositório (`StoreRepository`, linha 8)                               |
| `src/server/security/crypto.ts:25,34`                 | `encryptSecret` / `decryptSecret` (AES-256-GCM)       | Único helper criptográfico. Usa `node:crypto`. Chave em `ENCRYPTION_KEY` (linha 14)                                               |
| `src/server/db.ts:19`                                 | Singleton Prisma                                      | Lança erro no `import` se `DATABASE_URL` não existir (linha 12-13). Afeta testes unitários que importem rotas                     |
| `src/server/jobs/queue.ts:17,27`                      | Redis (`ioredis`) e filas BullMQ                      | Única conexão Redis existente no código                                                                                           |
| `src/server/shopify/client.ts:13`                     | `requireEnv(name)`                                    | Helper de variável de ambiente obrigatória (privado ao módulo, não exportado)                                                     |
| `src/shared/types.ts:7,19`                            | `StoreSummary`, `ApiError`                            | Contrato API/UI. Qualquer tipo de sessão/usuário exposto à UI entraria aqui (com aviso em "Desvios")                              |
| `prisma/schema.prisma:15,39`                          | Modelos `Store` e `WebhookEvent`                      | Não existe modelo de usuário, sessão ou credencial. `Store` não tem relação com pessoa alguma                                     |
| `prisma/seed.ts:11-14`                                | Seed das duas lojas por domínio                       | Único lugar que grava dados iniciais; não há usuário semeado                                                                      |
| `prisma/migrations/20260904000000_init/migration.sql` | Migração inicial                                      | Confirma que o banco só tem `Store` e `WebhookEvent`                                                                              |
| `next.config.ts:3`                                    | Config do Next                                        | Vazia. Sem `experimental.authInterrupts` (necessário para `unauthorized()`/`forbidden()`), sem `serverActions.allowedOrigins`     |
| `.env.example`                                        | Variáveis de ambiente                                 | Tem `ENCRYPTION_KEY`, `DATABASE_URL`, `REDIS_URL`, credenciais Shopify. Nenhuma variável de sessão/segredo de auth                |
| `package.json:22-33`                                  | Dependências                                          | Ver seção 4                                                                                                                       |
| `.claude/hooks/enforce-scope.sh:30-53`                | Hook de escopo                                        | Define quais caminhos cada engenheiro pode editar. Ver risco sobre `proxy.ts` e `next.config.ts` na seção 5                       |
| `.claude/hooks/block-secrets.sh`                      | Bloqueio de `.env*`, `*.key`, `*.pem`, `secrets.json` | Qualquer segredo de sessão terá de entrar via `.env`                                                                              |
| `playwright.config.ts:16-21`                          | Config de aceitação                                   | `webServer.url` é `/api/health`; `baseURL` `http://127.0.0.1:3000`                                                                |
| `vitest.config.ts:10-16`                              | Config unitária                                       | `environment: "node"`, só `src/**/*.test.{ts,tsx}`, setup em `vitest.setup.ts`                                                    |
| `tests/e2e/health.spec.ts`                            | Único teste de aceitação                              | Nome do teste segue padrão `CA-0: ...`                                                                                            |

### Documentação local do Next 16 lida (em `node_modules/next/dist/docs/01-app/`)

- `01-getting-started/16-proxy.md`
- `03-api-reference/03-file-conventions/proxy.md`
- `03-api-reference/03-file-conventions/middleware.md`
- `01-getting-started/15-route-handlers.md`
- `03-api-reference/03-file-conventions/route.md`
- `03-api-reference/04-functions/cookies.md`
- `03-api-reference/04-functions/headers.md`
- `03-api-reference/04-functions/next-request.md`
- `03-api-reference/04-functions/redirect.md`
- `03-api-reference/04-functions/unauthorized.md`
- `03-api-reference/04-functions/forbidden.md`
- `03-api-reference/03-file-conventions/unauthorized.md`
- `03-api-reference/05-config/01-next-config-js/authInterrupts.md`
- `02-guides/authentication.md`
- `02-guides/data-security.md` (seções 275-400 e 540-570)
- `01-getting-started/07-mutating-data.md`
- `03-api-reference/03-file-conventions/loading.md` (seção "Status codes")

---

## 2. Padrões existentes a seguir

**Rotas de API** (`src/app/api/stores/route.ts`)

- `export const dynamic = "force-dynamic"` no topo.
- Handler nomeado `GET()` sem argumentos; chama `createStoreService(prisma).listStores()` e devolve `NextResponse.json(...)`.
- `try/catch` em volta; no erro faz `console.error("GET /api/stores falhou", error.message)` (só a mensagem, não o objeto), e devolve `ApiError` `{ error: { code, message } }` com status 503. Código em SCREAMING_SNAKE (`STORES_UNAVAILABLE`), mensagem em português.
- Nenhuma rota lê corpo ou query ainda; portanto **não há exemplo de validação Zod em rota**, embora `zod` esteja em `package.json`.

**Serviços** (`src/server/stores/store.service.ts`)

- Fábrica `createXService(db)` que recebe uma interface mínima do Prisma (`StoreRepository`, linhas 8-20) tipada só com os métodos usados, para testes sem banco.
- Constante de `select` explícito (`STORE_SUMMARY_SELECT`, linha 22) e função `toSummary` (linha 44) que remove o campo sensível antes de devolver.
- Cabeçalho do arquivo em comentário explica a responsabilidade e o invariante.
- Normalização de entrada dentro do serviço (`domain.trim().toLowerCase()`, linha 62).
- Exporta o tipo `StoreService = ReturnType<typeof createStoreService>` (linha 70).

**Configuração por ambiente**

- Variáveis lidas com `process.env.X` e erro em português se ausente: `crypto.ts:15-16`, `db.ts:12-13`, `queue.ts:20`, `shopify/client.ts:13-17` (`requireEnv`). Não há módulo central de config.

**Logs**

- `console.error`/`console.log` diretos. Nenhuma biblioteca de log, nenhum helper de redação. A prática observada é logar só `error.message`.

**Frontend**

- Páginas em `src/app/**/page.tsx` são Server Components sem `"use client"`.
- Componentes interativos em `src/components/` com `"use client"` (`StoreList.tsx:1`).
- Chamadas à API via hook em `src/hooks/` (`useStores.ts`), com estado discriminado `{ status: "loading" | "error" | "ready" }` e `AbortController`.
- Quatro estados na UI com `role="status"` para carregando e `role="alert"` para erro.
- Tailwind 4 com classes utilitárias inline; fontes Geist no layout.

**Contratos compartilhados**

- Tipos em `src/shared/types.ts`, com aviso de que alterar exige nota em "Desvios".

**Jobs**

- `getQueue(QUEUES.x)` com `jobId` determinístico, 5 tentativas, backoff exponencial. Não há worker no repositório.

**Prisma**

- Comentários `///` nos modelos, `cuid()` como id, `createdAt`/`updatedAt`. Migrações geradas pelo Prisma, nunca à mão.

**Testes**

- Unitários com `vi.fn()` para o repositório falso, sem banco.
- Componentes com `// @vitest-environment jsdom` na primeira linha, `vi.stubGlobal("fetch", ...)` e `vi.unstubAllGlobals()` no `afterEach`.
- Aceitação com o fixture `request` do Playwright e nome `CA-<n>: descrição`.

**Escopo por pasta** (`enforce-scope.sh:30-53`)

- backend: `src/server/*`, `src/app/api/*`, `prisma/*`, `src/shared/*`, `docs/features/*`
- frontend: `src/app/*` (exceto `src/app/api/*`), `src/components/*`, `src/hooks/*`, `src/shared/*`, `docs/features/*`
- tests: `tests/*`, `*.test.*`, `*.spec.*`, `docs/features/*`
- Nenhum escopo cobre arquivos na raiz (`next.config.ts`, `proxy.ts`) nem `src/proxy.ts`. Ver seção 5.

---

## 3. Recursos semelhantes já implementados

Não existe nenhuma funcionalidade de autenticação, autorização, sessão, cookie ou proxy no repositório. A busca por `auth|session|login|proxy|middleware|cookie` em `src/` só encontrou:

- `getAuthTag`/`setAuthTag` do AES-GCM em `crypto.ts:30,44` (não relacionado);
- `Session` do `@shopify/shopify-api` em `shopify/client.ts:42-50` (sessão _da loja_ com a Shopify, não de pessoa);
- o comentário "sem auth" em `health/route.ts:5`.

Não existe `src/proxy.ts`, `proxy.ts`, `middleware.ts`, `unauthorized.tsx`, `forbidden.tsx`, `error.tsx`, `loading.tsx` nem `not-found.tsx`.

O que serve de **molde parcial**:

- Fluxo "rota fina → serviço injetável → `ApiError`": `src/app/api/stores/route.ts` + `src/server/stores/store.service.ts`.
- Segredo em repouso derivado de variável de ambiente base64 de 32 bytes com validação de tamanho: `src/server/security/crypto.ts:14-23`.
- Componente com quatro estados + hook de fetch: `src/components/StoreList.tsx` + `src/hooks/useStores.ts`.
- Teste de aceitação HTTP puro: `tests/e2e/health.spec.ts`.

---

## 4. Helpers reutilizáveis

**No código do projeto**

- `encryptSecret(plaintext, rawKey?)` / `decryptSecret(encoded, rawKey?)` em `src/server/security/crypto.ts:25,34`.
- `prisma` em `src/server/db.ts:19`.
- `getRedisConnection()` em `src/server/jobs/queue.ts:17` (observação, não recomendação).
- `ApiError` em `src/shared/types.ts:19`.
- `requireEnv(name)` em `src/server/shopify/client.ts:13` — **não exportado**.
- Padrão `StoresState` discriminado em `src/hooks/useStores.ts:6-9`.

**Dependências declaradas em `package.json` que cobrem as necessidades citadas** (sem adicionar nada):

| Necessidade                                                          | O que existe hoje                                                                                                    | Onde                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Validação de formulário/corpo                                        | `zod ^4.5.4`                                                                                                         | `package.json` (ainda sem uso no código) |
| Cookies (ler/gravar)                                                 | `cookies()` de `next/headers` (assíncrono), `request.cookies` em `NextRequest`, `response.cookies` em `NextResponse` | Next 16.3.4                              |
| Headers                                                              | `headers()` de `next/headers` (só leitura)                                                                           | `headers.md`                             |
| Hash de senha, HMAC, comparação em tempo constante, bytes aleatórios | `node:crypto` (`scrypt`, `pbkdf2`, `createHmac`, `timingSafeEqual`, `randomBytes`)                                   | já usado em `crypto.ts:8`                |
| Cifra simétrica                                                      | `encryptSecret`/`decryptSecret`                                                                                      | `crypto.ts`                              |
| Persistência (usuário/sessão em tabela)                              | Prisma 7 + PostgreSQL                                                                                                | `schema.prisma`, `db.ts`                 |
| Armazenamento em memória compartilhada                               | `ioredis ^6`                                                                                                         | `queue.ts`                               |
| Formulário com estado de envio                                       | React 19 `useActionState`, Server Actions do Next                                                                    | `07-mutating-data.md:339-357`            |
| Redirecionamento                                                     | `redirect()` de `next/navigation`; `NextResponse.redirect`                                                           | `redirect.md`, `proxy.md`                |
| Testes de proxy                                                      | `next/experimental/testing/server` (`unstable_doesProxyMatch`, `isRewrite`, `getRedirectUrl`)                        | existe no pacote instalado               |

**O que NÃO está declarado** (só entra se o briefing listar): nenhuma biblioteca de sessão/JWT (`iron-session`, `next-auth`, `better-auth`, `jsonwebtoken`), nenhuma de hash de senha (`bcrypt`, `argon2`). O pacote `jose@5.10.0` existe apenas como **dependência transitiva** de `@shopify/shopify-api`; importá-lo diretamente seria adicionar dependência sem declarar.

---

## 5. Riscos

### 5.1 Fuso horário e datas

- `Store.timezone` é por loja; não existe fuso por pessoa/usuário. Qualquer expiração de sessão ou "último login" seria uma data em UTC, sem fuso de usuário para converter. Ponto a esclarecer se alguma data de sessão for mostrada.
- Cookies usam `expires`/`maxAge` em tempo absoluto do servidor.

### 5.2 Isolamento multi-tenant

- Não existe modelo `User` nem relação entre pessoas e `Store`.
- **Não encontrei** se um usuário autenticado vê todas as lojas ou um subconjunto. `docs/architecture.md` só fala em "dono das lojas".
- Uma tabela de usuários/sessões seria a **primeira tabela sem `storeId`** além de `Store`; `docs/architecture.md:22-23` diz que "toda tabela futura tem `storeId` obrigatório". Conflito de regra a resolver no briefing.

### 5.3 Repetição e idempotência

- Não há limitação de tentativas de login, bloqueio por tentativas, nem proteção contra força bruta em lugar nenhum; o Next não oferece um (`data-security.md:476` remete a soluções externas).
- `cookies().delete` só funciona em Server Function ou Route Handler (`cookies.md:71-74`).
- Server Actions são acessíveis por POST direto e a autenticação deve ser reverificada dentro de cada uma (`07-mutating-data.md:31-32`, `data-security.md:337-368`).

### 5.4 Autenticação e autorização nos pontos de entrada — o que a doc do Next 16 diz

Pontos de entrada existentes: `GET /`, `GET /api/stores`, `GET /api/health`. Todos públicos.

**Proxy (antigo middleware)**

- `middleware.ts` está **deprecado** e renomeado para `proxy.ts` (`middleware.md:11`, `proxy.md:11,806`). Fica na raiz **ou em `src/`** ao lado de `app`. Export `default` ou nomeado `proxy`. Um único arquivo por projeto.
- Roda no **runtime Node.js por padrão**; a opção `runtime` **lança erro** em proxy (`proxy.md:253-255`).
- Sem `matcher`, roda em **toda** requisição, incluindo `_next/static`, `_next/image` e `public/`; a doc avisa que lógica de auth pode bloquear CSS/JS/imagens (`proxy.md:75`). `matcher` tem de ser constante.
- A doc classifica proxy como **verificação otimista**: "should not be used as a full session management or authorization solution" (`16-proxy.md:29`), "should not be your only line of defense" (`authentication.md:1121`), e recomenda ler só o cookie, sem banco, porque roda também em prefetch (`authentication.md:1033`).
- Pode responder diretamente com 401 JSON para `/api/*` (`proxy.md:589-632`) ou redirecionar.
- Server Functions são POST na rota que as usa: um `matcher` que exclui um caminho **também exclui as Server Functions dele** (`proxy.md:249-251`).
- Não deve depender de módulos compartilhados/globais (`proxy.md:19`); relevante porque `src/server/db.ts` lança no import sem `DATABASE_URL`.
- Passagem de informação do proxy para a app: headers de request via `NextResponse.next({ request: { headers } })`, cookies, rewrite, redirect ou URL (`proxy.md:21,414-468`).

**Route Handlers** (`/api/*`)

- Recebem `NextRequest` (com `request.cookies.get(...)`) e podem usar `cookies()`/`headers()` de `next/headers`. A doc recomenda verificar sessão **dentro de cada handler** e devolver 401/403 (`authentication.md:1501-1553`).
- `redirect()` lança; deve ficar **fora** do `try` (`redirect.md:51-53`). O padrão atual de rota tem `try/catch` envolvendo tudo.
- `GET` handlers não são cacheados por padrão (`route.md:669`).

**Páginas e layouts**

- `cookies()` e `headers()` são **assíncronos** e tornam a rota dinâmica.
- Gravar cookie **não é permitido durante renderização** de Server Component; só em Server Function ou Route Handler (`cookies.md:81-83`).
- A doc **desaconselha checagens de auth em layouts** (`authentication.md:1350-1360`). Recomenda a checagem perto do dado ("Data Access Layer") e em cada página/ação.
- Padrão "`return null` no layout se não autorizado" é explicitamente **não recomendado** (`authentication.md:1458`).

**`unauthorized()` / `forbidden()` e arquivos `unauthorized.tsx` / `forbidden.tsx`**

- **Experimentais**; exigem `experimental.authInterrupts: true` em `next.config.ts`. O `next.config.ts` atual está vazio.
- Não podem ser chamados no **root layout**. Um `try/catch` em volta engole o interrupt.
- Se chamados dentro de `<Suspense>` após início do streaming, o status HTTP já foi 200; para 401/403 reais a checagem tem de ocorrer antes do streaming ou no proxy.

**Server Actions (se o formulário de login usar)**

- Só POST; o Next compara `Origin` com `Host`/`X-Forwarded-Host` e aborta se não bater (proteção CSRF embutida). Se houver reverse proxy em produção com host diferente, exige `serverActions.allowedOrigins` em `next.config.ts`.
- IDs de action cifrados não substituem checagem de auth dentro da action.
- `redirect` em Server Action responde 303 em envio progressivo e navegação client-side com JS.

**Sessão — o que a doc apresenta como opções (sem recomendar aqui)**

- Sessão _stateless_ (dados assinados/cifrados no cookie) ou sessão em _banco_ (tabela + cookie com id) (`authentication.md:519-957`). Recomenda `HttpOnly`, `Secure`, `SameSite`, `Max-Age`/`Expires`, `Path` e payload mínimo (id, papel), sem e-mail nem dados pessoais.
- Para sessão em banco a doc sugere manter cookie sincronizado para checagem otimista no proxy.

**Risco de escopo da fábrica (bloqueio concreto)**

- `enforce-scope.sh:30-53` só libera `src/server/*`, `src/app/api/*`, `prisma/*`, `src/shared/*` (backend) e `src/app/*` (exceto api), `src/components/*`, `src/hooks/*`, `src/shared/*` (frontend). **Nenhum construtor pode criar `src/proxy.ts`, `proxy.ts` (raiz) nem editar `next.config.ts`.** Isso precisa ser resolvido antes do briefing, caso a solução escolhida use proxy ou `authInterrupts`.

### 5.5 Dados sensíveis em logs

- Não há biblioteca de log nem helper de redação; senhas, cookies de sessão, tokens e e-mails não têm nenhum filtro automático.
- `.gitignore` e `block-secrets.sh` cobrem `.env*`, `*.key`, `*.pem`, `secrets.json`. Um segredo de sessão em `.env` fica coberto; `.env.example` precisaria da nova variável **sem valor**.
- O `prisma/seed.ts` faz `console.log` do domínio de cada loja e o CLAUDE.md proíbe credenciais em seed. Como o primeiro usuário entra no sistema é pergunta da seção 7.

---

## 6. Testes que precisarão ser atualizados

**Estratégia existente**

- Unitários/componente: Vitest, `environment: "node"` global, `jsdom` por arquivo via comentário; só `src/**/*.test.{ts,tsx}`. Sem banco, sem Redis.
- Aceitação: Playwright em `tests/e2e/**`, sobe `npm run dev` em `127.0.0.1:3000` e espera `/api/health`. Não existe projeto de setup de autenticação nem `storageState`.

**Arquivos existentes afetados**

- `tests/e2e/health.spec.ts` — espera 200 em `/api/health`. Se `/api/health` passar a exigir login, este teste quebra. O `webServer.url` do Playwright aceita 401 como "pronto", mas o teste não.
- `src/components/StoreList.test.tsx` — o caso "mostra a mensagem de erro da API" cobre 503. Se um 401 passar a ter comportamento diferente (redirecionar), o hook `useStores` e este teste mudam.
- `src/server/stores/store.service.test.ts` — não muda se o serviço de lojas não mudar.
- `src/server/security/crypto.test.ts` — não muda; serve de modelo para testar qualquer helper novo em `src/server/security/`.

**Lacunas de teste que já existem**

- Não há teste unitário de `GET /api/stores` (a rota importa `@/server/db`, que lança no import sem `DATABASE_URL`). Qualquer teste unitário de rota protegida enfrentará o mesmo obstáculo.
- Não há teste de página nem de layout.
- Não há teste de proxy; o Next oferece `next/experimental/testing/server` para testar `matcher` e o retorno do proxy.

**Cobertura de aceitação que a história tende a exigir**: acesso anônimo a `/` e a `/api/stores`, login válido/inválido, logout, acesso com sessão. O Playwright hoje só usa o fixture `request`; não há fluxo de página (`page`) em nenhum teste.

---

## 7. Lacunas e perguntas

O `CLAUDE.md` não tem placeholders, então a fábrica pode rodar. O que **não encontrei no código** e só o dono do projeto pode responder:

**Quem e como**

1. Quem são os usuários iniciais? Só o dono (um único login) ou já mais de uma pessoa? Haverá papéis diferentes?
2. Método de login desejado: e-mail e senha; link mágico por e-mail (não há serviço de e-mail); provedor externo (Google, Shopify); senha única em variável de ambiente para a fase inicial?
3. Como o primeiro usuário é criado: seed (o `seed.ts` diz que nenhuma credencial é escrita ali), comando manual, variável de ambiente, tela de primeiro acesso?
4. Recuperação e troca de senha fazem parte desta funcionalidade?
5. Duração da sessão? Uma sessão por vez ou várias? Logout invalida todas?

**Escopo do que fica protegido** 6. `/api/health` continua público? Hoje é a URL de prontidão do Playwright. 7. A futura rota de webhooks `/api/webhooks/shopify` e o futuro callback OAuth serão chamados pela Shopify, não por pessoas. Como devem ser tratados na regra "só pessoas autorizadas acessam `/api/*`"?

**Multi-tenant** 8. Um usuário autenticado vê **todas** as lojas ou pode haver usuários restritos a uma loja? 9. Uma tabela de usuários/sessões não teria `storeId`. A regra de `docs/architecture.md:22-23` deve ganhar exceção explícita?

**Infra e operação** 10. Onde o RIDS vai rodar em produção? Há reverse proxy/host diferente? Afeta `Secure` no cookie, o check de `Origin`/`Host` das Server Actions e `APP_HOST`. 11. Um novo segredo de ambiente (para assinar sessão) pode ser adicionado ao `.env.example`? Ou reaproveitar `ENCRYPTION_KEY`? 12. Precisa de limite de tentativas de login/bloqueio?

**Fábrica / escopo de edição** 13. Os construtores não podem criar `src/proxy.ts` nem editar `next.config.ts`. Se a solução aprovada precisar de um deles, quem faz essa alteração? 14. `unauthorized()`/`forbidden()` são experimentais. O projeto aceita APIs experimentais do Next? 15. Nenhuma biblioteca de sessão/hash está declarada. O briefing deve decidir explicitamente entre `node:crypto` puro e adicionar uma dependência.

**Não encontrei**

- Nenhuma menção a auditoria de acesso (registrar quem entrou e quando).
- Nenhuma decisão sobre idioma da UI de login além do `lang="pt"` e textos em português.
- Nenhum `docs/features/` ainda; esta é a primeira funcionalidade da fábrica.
