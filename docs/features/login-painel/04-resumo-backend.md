# Resumo do backend — Login do painel

**Funcionalidade:** `login-painel` · **Briefing:** `03-briefing.md` (APROVADO) · **Data:** 2026-09-04 · **Agente:** `backend-engineer`

Estado: backend completo, typecheck/lint/testes verdes, `next build` reconhece o proxy e as 9 rotas. **Sem commit** (ponto de verificação 3 é do usuário). A migração foi gerada com `prisma migrate diff` e **ainda não foi aplicada a nenhum banco** (PostgreSQL indisponível nesta execução; ver seção 4).

---

## 1. Arquivos adicionados ou editados

### Banco (`prisma/**`)

- (A) `prisma/schema.prisma` — enums `UserRole`, `AuthAuditEvent`; modelos `User`, `Session`, `PasswordResetToken`, `AuthAuditLog`; comentário da exceção a `storeId` no topo.
- (N) `prisma/migrations/20260904120000_auth_users_sessions_audit/migration.sql` — gerada por `prisma migrate diff --from-schema <HEAD> --to-schema <atual> --script` (sem banco). `npx prisma validate` OK; `npm run db:generate` executado.

### Proxy

- (N) `src/proxy.ts` — verificação otimista do cookie; `PUBLIC_PATHS`, `isPublicPath(pathname, env)`, `proxy(request)`, `config.matcher`.
- (N) `src/proxy.test.ts` — matcher (via `unstable_doesMiddlewareMatch`), redirecionamento 307, 401 JSON, caminhos públicos, `/api/dev/*` só fora de produção.

### Domínio de auth (`src/server/auth/**`)

- (N) `auth.errors.ts` — `AuthError { code, status }`, `AUTH_ERROR_STATUS`, `isAuthError`, `EmailAlreadyInUseError` (só CLI).
- (N) `schemas.ts` — esquemas Zod 4 da seção 4.0 + `createUserSchema`, `testUserSchema`, `TOKEN_PATTERN`, `firstIssueMessage`.
- (N) `normalize.ts` — `normalizeEmail`.
- (N) `password.ts` — `hashPassword`, `verifyPassword`, `DUMMY_PASSWORD_HASH` (scrypt N=2^15, r=8, p=1, keylen 64, maxmem 64 MiB).
- (N) `tokens.ts` — `generateOpaqueToken`, `hashToken`, `isTokenFormat`.
- (N) `rate-limit.ts` — `RateLimitStore`, `RateLimiter`, `createRateLimiter`, `RATE_LIMIT_KEYS`, `withTimeout`, `TimeoutError`, `DEFAULT_RATE_LIMIT`.
- (N) `audit.ts` — `AuditRepository`, `AuditLog`, `createAuditLog(db, now)`; `record` nunca lança.
- (N) `mail/transport.ts` — `MailMessage`, `MailTransport`, `resolveMailTransportName`, `getMailTransport`.
- (N) `mail/resend-transport.ts` — `createResendTransport({ apiKey, from, fetchImpl? })` (fetch nativo, timeout 10 s).
- (N) `mail/captured-transport.ts` — `createCapturedTransport(store, now?)`, `readCapturedMessages(reader, to)`, `outboxKey`, `OUTBOX_TTL_SECONDS`.
- (N) `mail/reset-email.ts` — `buildResetUrl(token, env?)`, `buildResetEmail({ to, resetUrl })`, `RESET_EMAIL_SUBJECT`.
- (N) `auth.service.ts` — `AuthRepository`/`AuthModels` (subconjunto do Prisma), `createAuthService(deps)` com `login`, `logout`, `resolveSession`, `changePassword`, `requestPasswordReset`, `resetPassword`, `createUser`, `upsertTestUser`; constantes `SESSION_TTL_MS`, `RESET_TOKEN_TTL_MS`, `FORGOT_MIN_RESPONSE_MS`; `type AuthService`.
- (N) `auth.deps.ts` — `getAuthService()` (singleton; Redis e transporte de e-mail resolvidos preguiçosamente no primeiro comando).
- (N) `http.ts` — `SESSION_COOKIE`, `setSessionCookie`, `clearSessionCookie`, `isFormRequest`, `readAuthBody`, `respondAuth`, `errorOutcome`, `withQuery`, `apiErrorResponse`, `validationError`, `toAuthError`, `assertSameOrigin`.
- (N) `session-guard.ts` — `getCurrentUser`, `requirePageUser`, `authenticateApiRequest` (ver seção 2.9).
- (N) `cli/create-user.ts` — script `npm run auth:create-user`.
- (N) `testing/fakes.ts` — dublês em memória (repositório Prisma, store Redis, transporte de e-mail) usados pelos testes; não importa vitest.
- (N) testes ao lado: `schemas.test.ts`, `normalize.test.ts`, `password.test.ts`, `tokens.test.ts`, `rate-limit.test.ts`, `audit.test.ts`, `http.test.ts`, `auth.service.test.ts`, `mail/captured-transport.test.ts`, `mail/reset-email.test.ts`, `mail/resend-transport.test.ts`.

### Rotas (`src/app/api/**`)

- (N) `auth/login/route.ts`, `auth/logout/route.ts`, `auth/change-password/route.ts`, `auth/forgot-password/route.ts`, `auth/reset-password/route.ts`.
- (N) `dev/outbox/route.ts`, `dev/test-user/route.ts`.
- (A) `stores/route.ts` — `GET(request: NextRequest)` com `authenticateApiRequest` antes do serviço; comentário "Pendente" removido.

### Compartilhado (`src/shared/**`) — declarado em "Desvios"

- (A) `src/shared/types.ts` — acréscimos exatos da seção 9 do briefing, com `AUTH_ERROR_MESSAGES` preenchido.
- (N) `src/shared/safe-path.ts` — `toSafeInternalPath(value)`; (N) `src/shared/safe-path.test.ts`.

---

## 2. Contrato da API (como implementado)

### 2.0 Convenções

- Todas as rotas: `export const dynamic = "force-dynamic"`.
- **Corpo:** `Content-Type: application/json` **ou** `application/x-www-form-urlencoded`/`multipart/form-data` (formulário nativo). Corpo vazio, JSON inválido ou não-objeto é tratado como `{}` (cai em `VALIDATION_ERROR` com a mensagem do primeiro campo).
- **Resposta:** se o pedido veio de formulário nativo (pelo `Content-Type`), a rota responde `303 Location: <página>`; caso contrário responde JSON. Pedidos sem `Content-Type` são tratados como JSON.
- **Origem:** em todo `POST` de `/api/auth/*`, se `Origin` estiver presente e o host não coincidir com `Host` nem com `X-Forwarded-Host` → `403 FORBIDDEN_ORIGIN`. Sem `Origin` segue.
- **Erros:** `{ "error": { "code": AuthErrorCode, "message": string } }`. Mensagens exatas:

| `code`                     | HTTP | `message`                                                                                                                                                                     |
| -------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`         | 400  | primeiro problema Zod: `Informe o e-mail.`, `E-mail inválido.`, `Informe a senha.`, `Senha demasiado longa.`, `A senha deve ter pelo menos 10 caracteres.`, `Cargo inválido.` |
| `INVALID_CREDENTIALS`      | 401  | `E-mail ou senha incorretos`                                                                                                                                                  |
| `TOO_MANY_ATTEMPTS`        | 429  | `Muitas tentativas. Aguarde alguns minutos e tente de novo.`                                                                                                                  |
| `UNAUTHENTICATED`          | 401  | `Sessão necessária.`                                                                                                                                                          |
| `INVALID_CURRENT_PASSWORD` | 400  | `Senha atual incorreta`                                                                                                                                                       |
| `INVALID_RESET_TOKEN`      | 400  | `Este link é inválido ou expirou; peça um novo`                                                                                                                               |
| `MAIL_UNAVAILABLE`         | 503  | `Não foi possível enviar agora, tente mais tarde.`                                                                                                                            |
| `AUTH_UNAVAILABLE`         | 503  | `O serviço está indisponível de momento. Tente mais tarde.`                                                                                                                   |
| `FORBIDDEN_ORIGIN`         | 403  | `Origem do pedido não permitida.`                                                                                                                                             |
| `NOT_FOUND`                | 404  | `Não encontrado.`                                                                                                                                                             |

Estes textos (exceto `VALIDATION_ERROR`) estão em `AUTH_ERROR_MESSAGES` (`src/shared/types.ts`) para o caminho `?erro=` sem JavaScript.

### 2.1 Cookie de sessão

`Set-Cookie: rids_session=<token base64url 43 chars>; Path=/; Expires=<expiresAt UTC, +7 dias>; HttpOnly; SameSite=lax` e `Secure` **só** com `NODE_ENV=production`. Remoção: `rids_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=lax`.

### 2.2 `POST /api/auth/login` — público

- Requisição: `{ email: string; password: string; next?: string }` (`LoginRequest`). Formulário envia `email`, `password`, `next` (oculto).
- Sucesso JSON: `200 { user: { id, email, role } }` (`LoginResponse`) + cookie. Formulário: `303 Location: <toSafeInternalPath(next)>` + cookie.
- Erros: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `429 TOO_MANY_ATTEMPTS`, `503 AUTH_UNAVAILABLE`, `403 FORBIDDEN_ORIGIN`. Formulário: `303 /login?erro=<code>` (com `&next=<next>` quando `next` é seguro e diferente de `/`).
- Falha de validação não conta tentativa nem gera auditoria.

### 2.3 `POST /api/auth/logout` — público no proxy, idempotente

- Requisição: sem corpo (ou `{}`). Lê o cookie se existir.
- Sucesso JSON: `204` sem corpo + cookie de remoção. Formulário: `303 /login` + cookie de remoção.
- Erros: `503 AUTH_UNAVAILABLE`, `403 FORBIDDEN_ORIGIN`. Formulário: `303 /login?erro=<code>`.

### 2.4 `POST /api/auth/change-password` — sessão obrigatória

- Primeiro `authenticateApiRequest`; sem sessão válida → `401 UNAUTHENTICATED` **em JSON mesmo para formulário**, com cookie de remoção.
- Requisição: `{ currentPassword: string; newPassword: string }` (`ChangePasswordRequest`).
- Sucesso JSON: `200 { ok: true }`. Formulário: `303 /conta/senha?ok=1`.
- Erros: `400 VALIDATION_ERROR`, `400 INVALID_CURRENT_PASSWORD`, `429 TOO_MANY_ATTEMPTS`, `503 AUTH_UNAVAILABLE`, `403 FORBIDDEN_ORIGIN`. Formulário: `303 /conta/senha?erro=<code>`.
- Não toca em `Session` (CA-37). Apaga `PasswordResetToken` pendentes.

### 2.5 `POST /api/auth/forgot-password` — público

- Requisição: `{ email: string }` (`ForgotPasswordRequest`).
- Sucesso JSON: `200 { ok: true }` (exista a conta ou não; resposta demora pelo menos 800 ms). Formulário: `303 /esqueci-senha?enviado=1`.
- Erros: `400 VALIDATION_ERROR`, `429 TOO_MANY_ATTEMPTS`, `503 MAIL_UNAVAILABLE`, `503 AUTH_UNAVAILABLE`, `403 FORBIDDEN_ORIGIN`. Formulário: `303 /esqueci-senha?erro=<code>`.
- E-mail: assunto `Redefinir a senha do RIDS`; texto contém `http(s)://<APP_HOST>/redefinir-senha?token=<43 chars>`.

### 2.6 `POST /api/auth/reset-password` — público

- Requisição: `{ token: string; newPassword: string }` (`ResetPasswordRequest`). Formulário envia `token` oculto.
- Sucesso JSON: `200 { ok: true }`. Formulário: `303 /login?motivo=senha_redefinida`.
- Erros: `400 INVALID_RESET_TOKEN` (formato errado, desconhecido, expirado, usado ou substituído), `400 VALIDATION_ERROR` (senha < 10), `503 AUTH_UNAVAILABLE`, `403 FORBIDDEN_ORIGIN`. Formulário: `303 /redefinir-senha?erro=<code>&token=<token>` (`token` só se tinha o formato válido).
- Sucesso apaga **todas** as sessões do usuário (CA-38) e zera o contador de login.

### 2.7 `GET /api/stores` — passa a exigir sessão

- Sem sessão válida: `401 UNAUTHENTICATED` + cookie de remoção. Com sessão: `200 StoreSummary[]` (todas as lojas, qualquer cargo). `503 STORES_UNAVAILABLE` inalterado. Banco indisponível na verificação da sessão → `503 AUTH_UNAVAILABLE`.

### 2.8 Rotas só de desenvolvimento (`NODE_ENV !== "production"`)

Em produção respondem `404 NOT_FOUND` antes de qualquer coisa e o proxy não as trata como públicas.

- `GET /api/dev/outbox?to=<e-mail>` → `200 { messages: Array<{ to; subject; text; createdAt: string ISO }> }`, mais recente primeiro. `to` ausente → `400 VALIDATION_ERROR` (`Informe o e-mail.`). Redis fora → `503 AUTH_UNAVAILABLE`.
- `POST /api/dev/test-user` corpo `{ email, password, role? = "OWNER" }` → `200 { id, email, role }`. Se existir: atualiza hash e cargo, apaga sessões e tokens. Sempre zera as duas chaves Redis do e-mail. Erros: `400 VALIDATION_ERROR` (inclui `role` fora da lista), `503 AUTH_UNAVAILABLE`.

### 2.9 Proxy e páginas (para o `frontend-engineer`)

**Proxy (`src/proxy.ts`)** — só verifica se o cookie `rids_session` existe.

- Públicos: `/login`, `/esqueci-senha`, `/redefinir-senha`, `/api/health`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/forgot-password`, `/api/auth/reset-password` (e subcaminhos), mais `/api/dev/*` fora de produção.
- Protegido sem cookie: `/api/*` → `401 { error: { code: "UNAUTHENTICATED", message: "Sessão necessária." } }`; página → `307 /login?next=<encodeURIComponent(pathname + search)>`.
- Matcher: `"/((?!_next/static|_next/image|favicon\\.ico|.*\\.[A-Za-z0-9]+$).*)"`.

**Parâmetros de query das páginas**

- `/login?next=<caminho>` — destino após login; usar `toSafeInternalPath(next)` (devolve `/` se inválido).
- `/login?motivo=sessao_expirada` | `senha_redefinida` (`LoginNotice`).
- `/login?erro=<AuthErrorCode>` — só no caminho sem JavaScript; mostrar `AUTH_ERROR_MESSAGES[code]` (`VALIDATION_ERROR` não tem texto fixo; mostrar uma mensagem genérica de campo).
- `/esqueci-senha?enviado=1` | `?erro=<code>`.
- `/redefinir-senha?token=<43 chars>` | `&erro=<code>`.
- `/conta/senha?ok=1` | `?erro=<code>`.

**Exportações de `src/server/auth/session-guard.ts` que o frontend pode importar** (só em `page.tsx`, Server Components):

```ts
/** Usuário da sessão atual ou null. Banco indisponível → null (logado), para a página de login continuar a renderizar. */
export async function getCurrentUser(): Promise<CurrentUser | null>;

/** Primeira instrução de toda página protegida. Sem cookie → redirect("/login?next=<next>");
 *  cookie inválido/expirado → redirect("/login?motivo=sessao_expirada&next=<next>"). Banco indisponível → lança. */
export async function requirePageUser(opts: { next: string }): Promise<CurrentUser>;
```

`authenticateApiRequest(request: NextRequest): Promise<{ ok: true; user: CurrentUser } | { ok: false; response: NextResponse }>` é só para rotas de API.

**Tipos compartilhados** (`src/shared/types.ts`): `UserRole`, `USER_ROLE_LABELS`, `CurrentUser`, `AuthErrorCode`, `AUTH_ERROR_MESSAGES`, `LoginNotice`, `LoginRequest`, `LoginResponse`, `ChangePasswordRequest`, `ForgotPasswordRequest`, `ResetPasswordRequest`, `OkResponse`. `toSafeInternalPath` em `src/shared/safe-path.ts`.

### 2.10 CLI

`npm run auth:create-user -- --email <e-mail> --role OWNER|ADMIN|MARKETING` — pede a senha duas vezes sem eco (mínimo 10, têm de coincidir), cria a conta, imprime `conta criada: <email> (<role>)`. E-mail duplicado → `já existe uma conta com este e-mail`, saída 1. Não toca no Redis.

---

## 3. Helpers existentes reutilizados

- `prisma` (`src/server/db.ts`) e `getRedisConnection()` (`src/server/jobs/queue.ts`) em `auth.deps.ts` e `mail/transport.ts` — a decisão do briefing é reutilizar a conexão existente; como ela usa `maxRetriesPerRequest: null`, todo comando passa por `withTimeout(…, 2000)` (R-3).
- Padrão `createXService(db)` com interface mínima do repositório (`store.service.ts`) — replicado em `AuthRepository`/`AuditRepository`, o que permitiu testar todo o serviço com dublês em memória.
- Padrão de rota fina + `ApiError` + `console.error(..., error.message)` (`stores/route.ts`).
- `ApiError` (`src/shared/types.ts`) — todas as respostas de erro.
- `node:crypto` (já usado em `security/crypto.ts`) para scrypt, SHA-256, `randomBytes`, `timingSafeEqual`.
- `import "dotenv/config"` no CLI, como em `prisma/seed.ts`.
- `zod` (já declarado) para os esquemas e a validação da resposta do Resend.

Novos helpers criados (justificativa): `withTimeout` (não existia; necessário pelo R-3); `readAuthBody`/`respondAuth` (não havia rota que lesse corpo; necessário para JSON + formulário nativo); `testing/fakes.ts` (dublês partilhados por vários testes, evita duplicar um repositório falso em cada arquivo).

---

## 4. Desvios do briefing

1. **Alterações em `src/shared/**`** (obrigatório declarar): `src/shared/types.ts` recebeu exatamente os tipos da seção 9 (com `AUTH_ERROR_MESSAGES` implementado); `src/shared/safe-path.ts` e o seu teste são novos.
2. **Migração gerada por `prisma migrate diff`, não por `npm run migrate`** — não havia PostgreSQL acessível. O SQL é o que o Prisma gerou (não escrito à mão) e está em `prisma/migrations/20260904120000_auth_users_sessions_audit/`. **Ainda não foi aplicada a nenhum banco**: quem tiver o `docker compose` deve rodar `npm run migrate` (o Prisma vai reconhecer a migração pendente e aplicá-la).
3. **`unstable_doesMiddlewareMatch` em vez de `unstable_doesProxyMatch`** — o Next 16.3.4 instalado só exporta o nome antigo em `next/experimental/testing/server`.
4. **`AuthRepository` dividido em `AuthModels` + `$transaction<T>(fn: (tx: AuthModels) => Promise<T>)`** — o cliente de transação do Prisma não tem `$transaction`, por isso a interface do briefing (que listava `$transaction` no mesmo tipo passado ao callback) não seria atribuível. `prisma` continua atribuível a `AuthRepository` (verificado pelo typecheck).
5. **Métodos adicionais no serviço:** `upsertTestUser` (lógica da rota `/api/dev/test-user`, para a rota ficar fina) e validação da nova senha/e-mail/cargo também no serviço (defesa em profundidade; os testes de CA-20/CA-31 do briefing pedem isso em `createUser`).
6. **`createUser` com e-mail duplicado lança `EmailAlreadyInUseError`** (classe própria), porque `AuthErrorCode` não tem código de conflito e o briefing manda o CLI imprimir a mensagem e sair com 1; não é um erro de API.
7. **Redis e transporte de e-mail preguiçosos em `auth.deps.ts`** — o ioredis conecta ao ser construído; adiar até ao primeiro comando evita que o CLI e a leitura de sessões abram Redis. Comportamento observável igual ao briefing.
8. **`getCurrentUser` devolve `null` quando o banco está indisponível** (com `console.error`), para a página de login renderizar e o erro aparecer no login (CA-13). `requirePageUser` e `authenticateApiRequest` não mascaram: a rota devolve `503 AUTH_UNAVAILABLE` e a página lança (error boundary do Next). O briefing não especificava este caso.
9. **`resetPassword`: zerar o contador de login é melhor esforço** — se o Redis falhar depois da senha já ter mudado, a redefinição não é desfeita nem vira 503 (só log).
10. **Transporte Resend com `AbortSignal.timeout(10_000)`** — não estava no briefing; evita que um `fetch` pendurado bloqueie o pedido.
11. **`SESSION_COOKIE` duplicado em `src/proxy.ts`** — a doc do Next pede que o proxy não dependa de módulos compartilhados do servidor; o proxy importa só `@/shared/types` e `next/server`. O teste do proxy garante o nome.
12. `AuthError` para `VALIDATION_ERROR` sem mensagem usa `Dados inválidos.` como fallback (nunca atingido pelas rotas, que passam sempre a mensagem Zod).

Nada foi feito fora do escopo listado na seção 8 do briefing.

---

## 5. Resultado de typecheck, lint e testes

Ordem obrigatória executada após `npm run format` (Prettier: `All matched files use Prettier code style!`):

```
$ npm run typecheck   → tsc --noEmit            OK (sem erros)
$ npm run lint        → eslint .                OK (sem avisos)
$ npm test            → vitest run
  Test Files  16 passed (16)
  Tests       138 passed (138)
```

Suplementares: `npx prisma validate` OK; `npm run db:generate` OK; `npx next build` (com variáveis fictícias) OK — lista `ƒ Proxy (Middleware)` e as rotas `/api/auth/*`, `/api/dev/*`, `/api/health`, `/api/stores`. **Não** executado: `npm run migrate` (sem banco), `npm run test:e2e` (é do `test-verifier` e exige banco/Redis).

Tempo dos testes: ~6 s (scrypt a 2^15 custa ~50-100 ms por verificação; `auth.service.test.ts` faz ~60).

---

## 6. Regras que teriam ajudado

1. **"Rotas de API obtêm o serviço por uma fábrica substituível (`getXService()`), nunca importando `@/server/db` diretamente"** — permitiria testar rotas em Vitest com `vi.mock("@/server/auth/auth.deps")`; hoje só a aceitação as prova (R-12 do briefing).
2. **"Serviços com testes partilham dublês em `src/server/<domínio>/testing/`"** — decidir onde ficam fakes que não são `*.test.ts` levou tempo; uma convenção evita a dúvida (e o hook de escopo já cobre a pasta).
3. **"O proxy (`src/proxy.ts`) só importa `next/server` e `src/shared/**`"** — o Next avisa contra módulos compartilhados no proxy; uma regra explícita evita alguém importar `@/server/db` ali e derrubar o processo sem `DATABASE_URL`.
4. **"Quando o banco não está disponível na sessão do engenheiro, a migração é gerada com `prisma migrate diff --script` e marcada como não aplicada no resumo"** — foi a instrução do orquestrador; vale como regra permanente.
5. **"Testes que substituem uma função com `vi.mock` devem criar o spy com `vi.fn(implReal)`; `vi.restoreAllMocks()` apaga implementações definidas depois"** — foi o único erro desta execução (13 testes vermelhos por isso).
6. **Atualizar a tabela de APIs de teste do Next em `docs/`:** `next/experimental/testing/server` exporta `unstable_doesMiddlewareMatch` (não `unstable_doesProxyMatch`) na 16.3.4.

---

## Correção 1 (redirecionamento relativo)

**Data:** 2026-09-04 · **Origem:** `test-verifier`, `tests/e2e/auth-nojs.spec.ts` › "caso extremo (sem JS): login válido entra e mostra o painel".

**Problema.** `respondAuth` montava o 303 com `NextResponse.redirect(new URL(formRedirect, request.url))`. No Next 16, `request.url` é construído com o hostname/porta configurados do servidor (`attachRequestMeta`), não com o cabeçalho `Host`. Pedido a `127.0.0.1:3000` (ou a qualquer host atrás de reverse proxy, R-5(b)) recebia `Location: http://localhost:3000/...`; o cookie ficava em `127.0.0.1`, o navegador seguia para `localhost` e o proxy mandava de volta ao login.

**Alteração.**

- `src/server/auth/http.ts` — `respondAuth` devolve `new NextResponse(null, { status: 303, headers: { Location: toSafeInternalPath(formRedirect) } })`. O `Location` é um caminho relativo (RFC 9110 §10.2.2) e não depende de `request.url` nem de `Host`. `toSafeInternalPath` (`src/shared/safe-path.ts`, já existente) entra como defesa em profundidade: qualquer `formRedirect` que não seja caminho interno cai em `/`. Todos os `formRedirect` das cinco rotas são constantes internas ou já passavam por `toSafeInternalPath` (login); comportamento observável inalterado além do host.
- `src/server/auth/http.test.ts` — teste do 303 espera `Location: /conta/senha`; novo teste prova que, com `request.url` em `localhost` e `Host: 127.0.0.1:3000`, o `Location` é exatamente o caminho (sem `localhost` nem `127.0.0.1`); novo teste para o fallback `/` com destinos externos/`//`/`/\`/relativo sem barra, e passagem intacta de `/redefinir-senha?erro=X&token=abc`.

**Contrato da API.** Sem mudança de semântica; a seção 2.0 passa a ler-se: "a rota responde `303 Location: <caminho relativo da página>`" (antes podia sair URL absoluta).

**Verificação.**

```
$ npm run format      → Prettier OK
$ npm run typecheck   → tsc --noEmit   OK
$ npm run lint        → eslint .       OK
$ npm test            → 22 arquivos, 194 testes, todos passaram
$ curl -i -X POST http://127.0.0.1:3000/api/auth/login (form, credenciais inválidas)
    → HTTP/1.1 303 · location: /login?erro=VALIDATION_ERROR
  idem com Host: painel.exemplo.test → location: /login?erro=VALIDATION_ERROR
  POST /api/auth/logout (form)       → location: /login
```

**Observação fora do escopo desta correção (não alterado).** `src/proxy.ts:46` também usa `new URL("/login", request.url)` para o 307 de páginas protegidas. Hoje não quebra o fluxo porque o navegador é reencaminhado para o host do servidor e ali continua; mas atrás de um reverse proxy com outro hostname o mesmo defeito reaparece. Sugere-se a mesma abordagem (Location relativo) numa correção própria.

---

## Correção 2 (redirecionamento relativo no proxy)

**Data:** 2026-09-04 · **Origem:** observação registrada no fim da Correção 1 (`src/proxy.ts:46`), suspeita do mesmo defeito de `respondAuth`.

**Pedido.** Trocar o 307 de `NextResponse.redirect(new URL("/login", request.url))` por `Location` relativo (`/login?next=…`), como feito em `respondAuth`.

**O que se verificou (e por que o pedido não foi feito à letra).**

1. A versão com `new NextResponse(null, { status: 307, headers: { Location: "/login?next=%2F" } })` passou no Vitest, mas no `next dev` real devolveu **500**: o adapter do proxy (`next/dist/server/web/adapter.js`) faz `new NextURL(location)` sem base sobre todo `Location` de resposta do proxy, e um caminho relativo cru lança `TypeError: Invalid URL` (log: `ERR_INVALID_URL, input: '/login?next=%2F'`). Rotas de API (`respondAuth`) não passam por esse adapter, por isso lá o relativo funciona.
2. O código original **já produz `Location` relativo no servidor real**: o mesmo adapter, quando `redirectURL.host === requestURL.host` (ambos derivam de `request.url`, logo sempre coincidem), reescreve o `Location` com `getRelativeURL` para `/login?next=…`. Verificado com o código original em pé:
   ```
   $ curl -i http://127.0.0.1:3000/ -H 'Host: painel.exemplo.test'
     HTTP/1.1 307 · location: /login?next=%2F
   $ curl -i 'http://127.0.0.1:3000/conta/senha?x=1' -H 'Host: painel.exemplo.test:8443' -H 'X-Forwarded-Host: painel.exemplo.test' -H 'X-Forwarded-Proto: https'
     HTTP/1.1 307 · location: /login?next=%2Fconta%2Fsenha%3Fx%3D1
   ```
   Ou seja, a hipótese da Correção 1 ("atrás de reverse proxy o defeito reaparece no proxy") era falsa; o defeito existia só em rotas de API.
3. Usar o cabeçalho `Host` para montar a URL seria pior: quebraria a coincidência de host e o Next deixaria o `Location` absoluto para outro host.
4. Tentou-se provar o cabeçalho final num teste unitário chamando o adapter do Next; não é viável (exige os globais de AsyncLocalStorage do runtime). A prova fica com o servidor real e o e2e (`auth-login.spec.ts` já espera `/login?next=%2F`).

**Alteração efetiva (mínima).**

- `src/proxy.ts` — mantém `NextResponse.redirect(new URL("/login", request.url))` (única forma que o adapter aceita e a que ele relativiza), agora com comentário explicando a restrição e o porquê de não usar `Host` nem `Location` relativo. `next` passa por `toSafeInternalPath` (`src/shared/safe-path.ts`): pathname como `//evil.test/x` vira `next=%2F` em vez de propagar um candidato a redirecionamento aberto (a página de login já filtrava; agora é defesa em profundidade). Codificação de `next` inalterada (`/`→`%2F`, `?`→`%3F`, `=`→`%3D`). O proxy continua a importar só `next/server` e `src/shared/**`.
- `src/proxy.test.ts` — novo teste: com `request.url` em `http://localhost:3000` (Host `127.0.0.1:3000`) e em `https://interno.servidor.local` (Host `painel.exemplo.test`), o `Location` é absoluto com a **origem de `request.url`** (a condição que faz o Next relativizar), `pathname+search` exatamente `/login?next=%2Fconta%2Fsenha%3Fx%3D1`, e o host **não** é o do cabeçalho `Host`. Novo teste para `//evil.test/x` → `next=%2F`. Teste existente do 307 mantido.

**Contrato da API.** Seção 2.9 inalterada: página protegida sem cookie → `307 /login?next=<encodeURIComponent(pathname + search)>`; o `Location` que chega ao navegador é relativo (reescrito pelo Next), independente de `Host`/reverse proxy.

**Verificação.**

```
$ npm run format      → Prettier OK
$ npm run typecheck   → tsc --noEmit   OK
$ npm run lint        → eslint .       OK
$ npm test            → 22 arquivos, 196 testes, todos passaram
$ curl -i http://127.0.0.1:3000/ -H 'Host: painel.exemplo.test'     → 307 · location: /login?next=%2F
$ curl -i 'http://127.0.0.1:3000//evil.test/x'                       → 308 · location: /evil.test/x
  (o Next normaliza "//" antes do proxy; o toSafeInternalPath no proxy é só defesa em profundidade, coberto pelo teste unitário)
```

**Regra que teria ajudado.** "`src/proxy.ts` redireciona sempre com `NextResponse.redirect(new URL(caminho, request.url))`; nunca com `Location` relativo (o adapter do Next lança `Invalid URL`) nem com o cabeçalho `Host`. O Next relativiza o `Location` sozinho. Em rotas de API é o contrário: `Location` relativo." E: "Toda correção a um redirecionamento é confirmada com `curl -i` contra o `next dev` antes de fechar; o Vitest não passa pelo adapter do Next."
