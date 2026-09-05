# Relatório de validação — `login-painel`

**Base:** `7abfd38` → HEAD (79 arquivos) · **Artefatos:** `02-historia.md` (CA-1 a CA-43), `03-briefing.md` (§4, §6, §7, §8, §9), `04-resumo-backend.md` (+ Correções 1 e 2), `05-resumo-frontend.md`, `06-verificacao.md` (rodada 2: 64/64) · **Método:** leitura direta de todos os arquivos de código do escopo (serviço, HTTP, guarda, proxy, 8 rotas, esquemas, helpers, e-mail, CLI, schema/migração, 5 páginas, 5 formulários, 3 hooks, auxiliares, helper e2e) e Grep sobre `console.*`, `passwordHash`, `skip/only`, dependências e `docs/architecture.md`.

## Crítica

Nenhum achado.

## Importante

Nenhum achado.

## Secundária

**S-1 · Constantes usadas pela API e pela UI duplicadas em vez de viverem em `src/shared/`.**

- `src/components/auth/authQuery.ts:47` — `RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/` duplica `src/server/auth/schemas.ts:37` (`TOKEN_PATTERN`). Já apontado pelo frontend (§4.1 do resumo).
- `src/components/auth/authQuery.ts:15-26` — `AUTH_ERROR_CODES` repete à mão a união `AuthErrorCode` de `src/shared/types.ts:43-53`; um código novo tem de ser acrescentado em dois lugares (poderia derivar de `Object.keys(AUTH_ERROR_MESSAGES)` + `"VALIDATION_ERROR"`).
- `src/components/auth/passwordRules.ts:2-3` — mínimo 10 e o texto `A senha deve ter pelo menos 10 caracteres.` duplicam `src/server/auth/schemas.ts:21`.
- Viola: CLAUDE.md "Reutilize helpers existentes antes de criar um novo"; o próprio briefing (§5.10) resolveu o mesmo problema com `src/shared/safe-path.ts`. Sem impacto funcional hoje (os testes de aceitação provam que os valores coincidem).
- Corrigir: `backend-engineer` (mover para `src/shared/`, declarar em "Desvios") e depois `frontend-engineer` (consumir). Pode ir para o PR com nota.

**S-2 · `resetPassword` paga o custo do scrypt antes de saber se o token existe.**

- `src/server/auth/auth.service.ts:303` — `hashPassword(input.newPassword)` (scrypt N=2^15, ~32 MiB, ~50-100 ms) corre **antes** da transação que valida o token (linhas 305-316). `POST /api/auth/reset-password` é pública e não tem limite de tentativas; qualquer pedido com 43 caracteres bem formados e uma senha de 10 chars custa um scrypt ao servidor mesmo com token inválido.
- Não viola a letra do briefing (§3.7 não fixa a ordem) e o custo é o mesmo que o `login` já aceita por tentativa, mas contraria o espírito de R-13 ("`max(1024)` evita abuso"). Bastaria calcular o hash depois do `updateMany` bem-sucedido, ainda dentro da transação.
- Corrigir: `backend-engineer`. Pode ir para o PR com nota.

**S-3 · R-3 ("toda chamada ao Redis é envolvida num timeout de 2 s") só está cumprido no limitador.**

- `src/server/auth/mail/transport.ts:52-53` — `lpush`/`expire` do transporte `captured` chamam `getRedisConnection()` sem `withTimeout`.
- `src/app/api/dev/outbox/route.ts:21` — `readCapturedMessages(getRedisConnection(), to)` idem (`lrange`).
- Em produção não há exposição: `captured` é recusado (`transport.ts:29-33`) e `/api/dev/*` responde 404. Fora de produção, Redis pendurado deixa `forgot-password` sem resposta (a conexão tem `maxRetriesPerRequest: null`, exatamente o cenário descrito em R-3).
- Corrigir: `backend-engineer` (reutilizar `withTimeout` de `rate-limit.ts:52`). Pode ir para o PR com nota.

**S-4 · Página protegida com banco fora cai na tela padrão do Next (não há `error.tsx`).**

- `Glob src/app/**/{error,global-error}.tsx` devolve só `layout.tsx`. `src/server/auth/session-guard.ts:52-53` — `requirePageUser` propaga `AUTH_UNAVAILABLE` (Desvio 8 do backend, deliberado). Sem error boundary, `/` e `/conta/senha` mostram a página de erro genérica do Next (em produção: texto em inglês com `digest`, sem stack trace; em dev: overlay).
- Não quebra nenhum CA (CA-13 é sobre o login, que está tratado por `getCurrentUser` → `null`). Fica fora do padrão "mensagem controlada em português" e do escopo "textos só em português" da história (§4).
- Corrigir: `frontend-engineer` (`src/app/error.tsx` com mensagem genérica) — arquivo fora da §8, precisa de aval do orquestrador. Pode ficar para depois com nota.

**S-5 · Divergência conhecida (ponto 8): "mesma mensagem genérica" vs `400 VALIDATION_ERROR` com `Senha demasiado longa.`** — classificação: **Secundária, documental; não é defeito.**

- Implementação em `src/server/auth/schemas.ts:11,17,22` segue o briefing aprovado (§4.0), que é o artefato mais recente e mais específico. A mensagem não depende de a conta existir (sem vazamento), a validação lança antes do serviço (`src/app/api/auth/login/route.ts:29-30`), logo não conta tentativa nem gera auditoria — coerente com CA-9/CA-40. Para o token do link, a implementação já dá "a mesma mensagem genérica" (CA-29) em `reset-password/route.ts:32` e `redefinir-senha/page.tsx:24-41`.
- Ação: o orquestrador anota uma emenda de uma linha no caso extremo da história ("recusados com mensagem controlada de validação"). Nenhum construtor.

**S-6 · Arquivos dentro das pastas mas ausentes da §8; declaração inexata no resumo do backend.**

- `src/server/auth/testing/fakes.ts` e `src/server/auth/mail/resend-transport.test.ts` não constam da §8. Estão justificados em §3 do `04-resumo-backend.md`, mas a §4 afirma "Nada foi feito fora do escopo listado na seção 8" — inexato. `fakes.ts` não importa `vitest` (verificado) e só toca `passwordHash` como campo do dublê (`fakes.ts:132`).
- Frontend: os 6 auxiliares (`authQuery.ts`, `fields.tsx`, `AuthPageShell.tsx`, `useHydrated.ts`, `passwordRules.ts`, `testing/authTestUtils.ts`) estão declarados em "Desvios 1" e dentro de `src/components/**` — aceitáveis.
- `tests/e2e/auth-audit.spec.ts` — não listado na §8; está em `tests/e2e/**`, domínio do `test-verifier` — aceitável.
- Nenhum dos 79 arquivos está fora de `src/server/**`, `src/app/**`, `src/components/**`, `src/hooks/**`, `src/shared/**`, `prisma/**`, `tests/**`, `docs/features/**`, `src/proxy.ts`, `src/proxy.test.ts`.
- Corrigir: `backend-engineer` (uma linha no §4 do resumo). Nota.

## Resultado por ponto verificado

**1. Critérios de aceitação → código.** Todos os 43 têm código que os realiza. Mapa resumido (arquivo:linha aberto):

- CA-1/10/11/12/17: `src/proxy.ts:35-55`; `session-guard.ts:52-61, 69-87`; `auth.service.ts:203-220`; `app/api/stores/route.ts:15-16`.
- CA-2/6: `login/route.ts:28,42`; `LoginForm.tsx:52`; `app/login/page.tsx:20-21`; `safe-path.ts:8-17`.
- CA-3/15/16: `auth.service.ts:28,178-181`; `http.ts:26-39` (Expires absoluto, uma `Session` por login).
- CA-4/19/33: `stores/route.ts:14-19` (lista tudo, sem filtro por cargo; `store.service.ts` não alterado).
- CA-5: `logout/route.ts:18-28`; `auth.service.ts:190-197` (`deleteMany`, idempotente); `PanelHeader.tsx:18-23`.
- CA-7/8/9/13/18/21: `auth.service.ts:150-187` (hash de sacrifício em 161-164; `INCR` em 166; `DEL` em 176); `schemas.ts:7-28`; `LoginForm.tsx:25-32` (CA-9 local, sem `fetch`); `AUTH_ERROR_MESSAGES` em `types.ts:56-66`.
- CA-14/20/31/32: sem rota de registo (só 5 rotas em `src/app/api/auth/`); `cli/create-user.ts:16-34,53-62`; `schema.prisma:65-69,87` (`role` obrigatório sem default); `schemas.ts:19-22,44`.
- CA-22/26/27/37/41: `auth.service.ts:223-249` (mesma chave do login em 232-238; não toca em `Session`; apaga tokens em 244); `change-password/route.ts:25-26` (`authenticateApiRequest` primeiro).
- CA-23: `PanelHeader.tsx:32-51`; `USER_ROLE_LABELS` em `types.ts:30-34`.
- CA-24/28/30/36: `auth.service.ts:252-294` (bloqueio → `INCR` → `ping` → busca → `send` antes de persistir → transação `deleteMany`+`create` → espera até 800 ms); `reset-email.ts:17-28` (sem hora absoluta, sem senha).
- CA-25/29/34/35/38/42: `auth.service.ts:297-337` (`expiresAt <= now`, `usedAt` condicional, `session.deleteMany({userId})`, auditoria, `DEL` do contador); `reset-password/route.ts:32`; `redefinir-senha/page.tsx:24-41`; `ResetPasswordForm.tsx:38-41`.
- CA-39/40/43: `audit.ts:37-55` (só `event/email/userId/reason/createdAt`, `record` nunca lança); `auth.service.ts:155,167-172,182`; `schema.prisma:127-140` (sem coluna para senha/token/cookie/IP/UA); `migration.sql:43-52`.

**2. Caminhos de falha sem teste.** Cobertos: banco fora (`auth.service.test.ts:188`), Redis fora e timeout (`rate-limit.test.ts:61,78`; `auth.service.test.ts:200`), e-mail fora em `ping` e em `send` (`auth.service.test.ts:407,420`), auditoria que falha (`audit.test.ts:63`; `auth.service.test.ts:208`), token expirado/usado/substituído/adulterado (`:490,511,523`), `Origin` divergente e `"null"` (`http.test.ts:216-220`), `Secure` só em produção (`http.test.ts:76-93`), `/api/dev/*` em produção (`proxy.test.ts:53-56,125-128`). Não coberto em nenhum nível: o ramo 503 de `session-guard.ts:77-86` (banco fora ao validar sessão numa rota) — coerente com R-12 (módulo importa `@/server/db`), registado como observação, não como achado. Nenhum `skip`/`only`/`fixme` em `src/**` nem `tests/**`.

**3. Segurança.** Nenhuma lacuna. `passwordHash` só aparece em `auth.service.ts`, `fakes.ts` e o seu teste; `toCurrentUser` (`auth.service.ts:118-120`) é a única saída para a UI/API. Todos os `console.*` de produção (12 ocorrências) registam só `error.message` ou texto fixo — nenhum recebe e-mail, senha, token ou cookie; o CLI imprime só e-mail e cargo (`create-user.ts:70`). Auditoria sem campo para segredo (`audit.ts:9-16`). `authenticateApiRequest` é a primeira instrução em `stores/route.ts:15` e `change-password/route.ts:25`; `requirePageUser` é a primeira em `app/page.tsx:9` e `conta/senha/page.tsx:14`. `/api/dev/*` devolve 404 antes de qualquer efeito (`outbox/route.ts:15-17`, `test-user/route.ts:16-18`) e o proxy só os libera fora de produção (`proxy.ts:31`). `assertSameOrigin` em todos os 5 POST de auth. `toSafeInternalPath` em `login/route.ts:28`, `http.ts:143` (todo 303), `proxy.ts:54`, `login/page.tsx:24`, `LoginForm.tsx:52`. Timing: hash de sacrifício (`auth.service.ts:161-164`) e `ping` + 800 ms em ambos os ramos (`:261,289-290`). Cookie `HttpOnly; SameSite=Lax; Path=/; Expires` e `Secure` em produção (`http.ts:17-24`). Erros brutos nunca chegam ao cliente. Resposta do Resend validada com Zod e sem corpo em log (`resend-transport.ts:39-45`).

**4. Arquivos fora do escopo.** Nenhum fora das pastas permitidas. Ver S-6 para os não listados na §8. Arquivos do orquestrador conferidos: `package.json:21`, `.env.example:17-28`, `playwright.config.ts:18`, `.claude/hooks/enforce-scope.sh:34`, `docs/architecture.md:25-29,65-81`. `next.config.ts`, `prisma/seed.ts`, `tests/e2e/health.spec.ts` não alterados.

**5. Padrões do CLAUDE.md.** Rotas finas nas 8 rotas; lógica em `auth.service.ts`; dependências por parâmetro em todas as fábricas; UI com quatro estados nos 5 componentes; chamadas à API só por hooks. `package.json` **não** foi alterado desde a base — zero dependências novas. `src/generated/**` intocado.

**6. Duplicação.** `SESSION_COOKIE` em `proxy.ts:12` — justificado e protegido por teste; aceito. As demais estão em S-1.

**7. Riscos da §7.** R-1 ✓. R-2 ✓. R-3 ✓ no limitador — lacuna fora de produção em S-3. R-6 ✓. R-7 ✓. R-9 ✓. R-10 ✓. R-13 ✓ — ver S-2 para a ordem em `resetPassword`. R-5 depende de hospedagem.

**8. Dependências adicionadas.** Nenhuma.

## Veredito

**Pronto para revisão final.** Nenhum achado crítico nem importante; 6 achados secundários (S-1 a S-6), todos compatíveis com seguir para o PR com nota. Recomendação: tratar S-2 (ordem do scrypt em `resetPassword`) e S-1 (constantes em `src/shared/`) numa correção curta do `backend-engineer` antes do PR, por serem baratos; S-4 e S-5 são decisões do orquestrador/dono.
