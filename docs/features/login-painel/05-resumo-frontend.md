# Resumo do frontend — Login do painel

**Funcionalidade:** `login-painel` · **Briefing:** `03-briefing.md` (APROVADO) · **Backend:** `04-resumo-backend.md` · **Data:** 2026-09-04 · **Agente:** `frontend-engineer`

Estado: frontend completo contra o contrato do backend. `npm run format`, `npm run typecheck`, `npm run lint` (sem erros nem avisos) e `npm test` (22 arquivos, 192 testes) verdes; `npx next build` compila as 4 páginas novas como dinâmicas. **Sem commit** (ponto de verificação 3 é do usuário). Nenhuma dependência nova.

---

## 1. Arquivos adicionados ou editados

### Hooks (`src/hooks/**`)

- (N) `src/hooks/apiClient.ts` — `apiFetch<T>` (sempre devolve `ApiResult<T>`, nunca lança), `redirectToLogin`, `GENERIC_UNAVAILABLE_MESSAGE`, tipos `ApiResult`/`ApiErrorBody`.
- (N) `src/hooks/useApiMutation.ts` — `useApiMutation<TBody, TData>(path)` → `{ state, submit }` com `MutationState`; sem duplo envio.
- (A) `src/hooks/useStores.ts` — passa a usar `apiFetch`; `UNAUTHENTICATED` redireciona e fica em `loading`. `StoresState` inalterado.

### Componentes (`src/components/**`)

- (N) `src/components/PanelHeader.tsx` — cabeçalho autenticado (e-mail, cargo, "Alterar senha", "Sair").
- (N) `src/components/auth/LoginForm.tsx` — formulário de login (exporta também `validateLogin`, `EMAIL_PATTERN`).
- (N) `src/components/auth/ForgotPasswordForm.tsx` — "esqueci a senha" (exporta `FORGOT_PASSWORD_SENT_MESSAGE`).
- (N) `src/components/auth/ResetPasswordForm.tsx` — nova senha pelo link (exporta `RESET_PASSWORD_REDIRECT`).
- (N) `src/components/auth/ChangePasswordForm.tsx` — troca autenticada (exporta `PASSWORD_CHANGED_MESSAGE`).
- (N) `src/components/auth/authQuery.ts` — leitura de `searchParams` (`firstParam`, `parseAuthErrorCode`, `parseLoginNotice`, `parseFlag`, `parseResetToken`, `RESET_TOKEN_PATTERN`), `LOGIN_NOTICE_MESSAGES`, `messageForErrorCode`, `GENERIC_VALIDATION_MESSAGE`. _(não listado no briefing; ver Desvios 1)_
- (N) `src/components/auth/fields.tsx` — `TextField`, `SubmitButton`, `FormAlert` (`role="alert"`), `FormStatus` (`role="status"`) e classes Tailwind partilhadas. _(Desvios 1)_
- (N) `src/components/auth/AuthPageShell.tsx` — moldura das páginas públicas (título + "RIDS"). _(Desvios 1)_
- (N) `src/components/auth/useHydrated.ts` — `useSyncExternalStore` que devolve `false` no servidor e `true` após hidratação; liga `noValidate` só com JavaScript. _(Desvios 1 e 8)_
- (N) `src/components/auth/passwordRules.ts` — `validateNewPassword` (mínimo 10, coincidência) e mensagens. _(Desvios 1)_
- (N) `src/components/testing/authTestUtils.ts` — dublês de teste (`stubLocation`, `stubFetch`, `stubPendingFetch`, `lastRequest`, `apiError`). _(Desvios 1)_

### Páginas (`src/app/**`, Server Components, sem `"use client"`)

- (N) `src/app/login/page.tsx`, (N) `src/app/esqueci-senha/page.tsx`, (N) `src/app/redefinir-senha/page.tsx`, (N) `src/app/conta/senha/page.tsx`.
- (A) `src/app/page.tsx` — `requirePageUser({ next: "/" })` como primeira instrução; `<PanelHeader>` substitui o `<header>`; resto igual.

### Testes

- (N) `src/hooks/apiClient.test.ts` (9), (N) `src/components/PanelHeader.test.tsx` (6), (N) `src/components/auth/LoginForm.test.tsx` (12), (N) `ForgotPasswordForm.test.tsx` (8), (N) `ResetPasswordForm.test.tsx` (8), (N) `ChangePasswordForm.test.tsx` (10).
- (A) `src/components/StoreList.test.tsx` — mantém os 4 casos; acrescenta `CA-11: 401 UNAUTHENTICATED redireciona para o login sem mostrar erro`.

Não toquei em `src/app/api/**`, `src/server/**`, `prisma/**`, `src/shared/**`, nem em arquivos da raiz.

---

## 2. Componentes, páginas e hooks criados

### Hooks

| Hook / função                        | Endpoint            | Notas                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apiFetch<T>(input, init?)`          | qualquer            | Envia `Accept: application/json` (e `Content-Type: application/json` quando há corpo). `204` → `data: undefined`. Rede fora → `{ ok: false, status: 0, error: AUTH_UNAVAILABLE }`; corpo não-JSON ou sem formato `ApiError` → `AUTH_UNAVAILABLE` com o status real e a mensagem genérica. `error.code === "UNAUTHENTICATED"` (só pelo código) → `redirectToLogin("sessao_expirada")` e promessa que nunca resolve. |
| `redirectToLogin("sessao_expirada")` | —                   | `window.location.assign("/login?motivo=sessao_expirada&next=" + encodeURIComponent(pathname + search))`.                                                                                                                                                                                                                                                                                                           |
| `useApiMutation<TBody, TData>(path)` | `POST path` em JSON | `state`: `idle` → `submitting` → `success { data }` / `error { error }`. `submit` durante `submitting` devolve a promessa em curso (sem segundo pedido).                                                                                                                                                                                                                                                           |
| `useStores()`                        | `GET /api/stores`   | `loading` / `error { message }` / `ready { stores }`; `UNAUTHENTICATED` → redireciona, fica `loading`.                                                                                                                                                                                                                                                                                                             |

### Páginas (URL, parâmetros de query aceitos, textos exatos)

Todas leem `await searchParams` (Next 16: `Promise`), passam props aos formulários e exportam `dynamic = "force-dynamic"`. Todos os formulários têm `method="post"` e `action` na rota da API, para funcionarem sem JavaScript.

**`/` (protegida)** — `requirePageUser({ next: "/" })` como primeira instrução. Renderiza `PanelHeader` + `<h2>Lojas</h2>` + `StoreList` (estados existentes: `Carregando lojas…` em `role="status"`, erro em `role="alert"`, `Nenhuma loja registrada ainda.`, lista).

**`/login`** — página pública. `getCurrentUser()`; se há sessão → `redirect("/")` (CA-6). Query: `next` (passa por `toSafeInternalPath`; `/` se ausente/inválido), `motivo` (`sessao_expirada` | `senha_redefinida`), `erro` (`AuthErrorCode`, caminho sem JS).

- Título (`h1`): `Entrar no RIDS`; acima, `RIDS` em texto pequeno.
- Campos: rótulo `E-mail` (`id="login-email"`, `name="email"`, `type="email"`), rótulo `Senha` (`id="login-password"`, `name="password"`); oculto `name="next"`.
- Botão: `Entrar` / `A entrar…` (desabilitado, `aria-busy="true"`).
- Link: `Esqueci a senha` → `/esqueci-senha`. Não existe texto de criar conta/registar (CA-14).
- Avisos em `role="status"` (só antes de submeter): `A sua sessão terminou. Entre de novo.` (`motivo=sessao_expirada`), `Senha redefinida. Entre com a nova senha.` (`motivo=senha_redefinida`).
- Validação local (CA-9), junto ao campo com `aria-describedby` (`login-email-error`, `login-password-error`), sem chamar a API: `Informe o e-mail.`, `E-mail inválido.`, `Informe a senha.`.
- Erros da API em `role="alert"` com `error.message` tal como vem: `E-mail ou senha incorretos`, `Muitas tentativas. Aguarde alguns minutos e tente de novo.`, `O serviço está indisponível de momento. Tente mais tarde.`, etc. `VALIDATION_ERROR` da API vai para o campo (mensagem com "e-mail" → campo e-mail; senão → senha).
- Sem JS: `?erro=<code>` → `AUTH_ERROR_MESSAGES[code]` em `role="alert"`; `?erro=VALIDATION_ERROR` → `Verifique os campos e tente de novo.`.
- Sucesso: `window.location.assign(toSafeInternalPath(next))`.
- Formulário: `action="/api/auth/login"`; corpo JSON `{ email (trim), password, next }`.

**`/esqueci-senha`** — pública. Query: `enviado` (`1`), `erro`.

- Título: `Esqueci a senha`. Texto de apoio: `Informe o e-mail da sua conta. O link enviado vale por 1 hora e só pode ser usado uma vez.`
- Campo: `E-mail` (`id="forgot-email"`, `name="email"`). Botão: `Enviar link` / `A enviar…`. Link: `Voltar ao login` → `/login`.
- Sucesso (ou `?enviado=1`) em `role="status"`: `Se existir uma conta com este e-mail, enviámos um link para redefinir a senha`; o campo é limpo.
- Erros em `role="alert"`: `Muitas tentativas. Aguarde alguns minutos e tente de novo.` (429), `Não foi possível enviar agora, tente mais tarde.` (503 `MAIL_UNAVAILABLE`), `O serviço está indisponível de momento. Tente mais tarde.` (503 `AUTH_UNAVAILABLE`). Local: `Informe o e-mail.`, `E-mail inválido.`.
- Formulário: `action="/api/auth/forgot-password"`; JSON `{ email }`.

**`/redefinir-senha`** — pública. Query: `token` (43 chars base64url), `erro`.

- Título: `Definir nova senha`.
- Sem `token` ou formato inválido: só `role="alert"` com `Este link é inválido ou expirou; peça um novo` e link `Pedir um novo link` → `/esqueci-senha`; a API não é chamada.
- Com token: campos `Nova senha` (`id="reset-new-password"`, `name="newPassword"`) e `Confirmar nova senha` (`id="reset-confirm-password"`, `name="confirmPassword"`); oculto `name="token"`. Botão: `Redefinir senha` / `A redefinir…`. Link: `Voltar ao login`.
- Validação local (CA-27): `A senha deve ter pelo menos 10 caracteres.` (campo nova senha), `As senhas não coincidem.` (campo confirmar). API não chamada.
- Sucesso: `role="status"` `Senha redefinida. A levar ao login…` e `window.location.replace("/login?motivo=senha_redefinida")`.
- Erros em `role="alert"`: `Este link é inválido ou expirou; peça um novo` + link `Pedir um novo link` (`INVALID_RESET_TOKEN`), mensagem genérica (`AUTH_UNAVAILABLE`); `VALIDATION_ERROR` da API no campo nova senha. Sem JS: `?erro=` idem.
- Formulário: `action="/api/auth/reset-password"`; JSON `{ token, newPassword }`.

**`/conta/senha` (protegida)** — `requirePageUser({ next: "/conta/senha" })` primeiro. Query: `ok` (`1`), `erro`.

- `PanelHeader` + `<h2>Alterar a senha</h2>`.
- Campos: `Senha atual` (`id="change-current-password"`, `name="currentPassword"`), `Nova senha` (`change-new-password`, `newPassword`), `Confirmar nova senha` (`change-confirm-password`, `confirmPassword`). Botão: `Alterar senha` / `A alterar…`. Link: `Voltar às lojas` → `/`.
- Sucesso (ou `?ok=1`) em `role="status"`: `Senha alterada com sucesso.`; campos limpos; **sem navegação** (CA-22).
- Validação local: `Informe a senha atual.`, `A senha deve ter pelo menos 10 caracteres.`, `As senhas não coincidem.`.
- Erros em `role="alert"`: `Senha atual incorreta` (`INVALID_CURRENT_PASSWORD`), `Muitas tentativas. Aguarde alguns minutos e tente de novo.`, mensagem genérica de indisponibilidade. `UNAUTHENTICATED` → `apiFetch` redireciona para `/login?motivo=sessao_expirada&next=%2Fconta%2Fsenha`, sem alerta.
- Formulário: `action="/api/auth/change-password"`; JSON `{ currentPassword, newPassword }`.

### `PanelHeader` (`"use client"`, props `{ user: CurrentUser }`)

`h1` `RIDS`, `Gestão das lojas Shopify`, o e-mail do usuário, o cargo via `USER_ROLE_LABELS` (`Proprietário` / `Admin` / `Marketing`), link `Alterar senha` → `/conta/senha`, formulário `method="post" action="/api/auth/logout"` com botão `Sair` / `A sair…`. Com JS: `POST /api/auth/logout` (204) → `window.location.replace("/login")`; se a API falhar, navega para `/login` de qualquer forma.

---

## 3. Estados tratados

| Tela / componente            | Carregando                                                                                       | Vazio                                                                | Erro                                                                                                                                              | Sucesso                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `StoreList` (`/`)            | `Carregando lojas…` (`role="status"`); `UNAUTHENTICATED` mantém este estado enquanto redireciona | `Nenhuma loja registrada ainda.`                                     | mensagem da API em `role="alert"` (503 etc.)                                                                                                      | lista de lojas                                                                                |
| `LoginForm`                  | botão `A entrar…` desabilitado, `aria-busy`                                                      | formulário em branco (`idle`); avisos de `motivo` em `role="status"` | campo (CA-9 / `VALIDATION_ERROR`) ou `role="alert"` (`INVALID_CREDENTIALS`, `TOO_MANY_ATTEMPTS`, `AUTH_UNAVAILABLE`, `?erro=`)                    | navegação completa para `next`                                                                |
| `ForgotPasswordForm`         | `A enviar…`                                                                                      | formulário em branco                                                 | campo ou `role="alert"` (429, 503 `MAIL_UNAVAILABLE`/`AUTH_UNAVAILABLE`, `?erro=`)                                                                | frase neutra em `role="status"`, campo limpo (`?enviado=1` idem)                              |
| `ResetPasswordForm` / página | `A redefinir…`                                                                                   | sem token válido: só a mensagem de CA-29 e link para pedir novo      | campo ou `role="alert"` (`INVALID_RESET_TOKEN` + link, `AUTH_UNAVAILABLE`, `?erro=`)                                                              | `role="status"` + `replace("/login?motivo=senha_redefinida")`                                 |
| `ChangePasswordForm`         | `A alterar…`                                                                                     | formulário em branco                                                 | campo ou `role="alert"` (`INVALID_CURRENT_PASSWORD`, `TOO_MANY_ATTEMPTS`, `AUTH_UNAVAILABLE`, `?erro=`); `UNAUTHENTICATED` redireciona sem alerta | `Senha alterada com sucesso.` em `role="status"`, campos limpos, sem navegação (`?ok=1` idem) |
| `PanelHeader`                | `A sair…` desabilitado                                                                           | n/a (recebe o usuário resolvido)                                     | falha da API de logout → navega para `/login` mesmo assim                                                                                         | `replace("/login")`                                                                           |

---

## 4. Feedback para o backend

Nenhuma incompatibilidade: consumi rotas, corpos, códigos e mensagens exatamente como no contrato (seção 2 do resumo do backend) e todos os tipos necessários existem em `src/shared/types.ts`. Duas sugestões (não bloqueiam):

1. `TOKEN_PATTERN` (`/^[A-Za-z0-9_-]{43}$/`) vive em `src/server/auth/tokens.ts`, que o frontend não pode importar; a página `/redefinir-senha` duplica-o em `src/components/auth/authQuery.ts` (`RESET_TOKEN_PATTERN`). Mover para `src/shared/` evitaria a duplicação.
2. No caminho sem JavaScript, `?erro=VALIDATION_ERROR` chega sem a mensagem Zod; a UI mostra `Verifique os campos e tente de novo.`. Se o 303 levasse também a mensagem (ex.: `&mensagem=`), a página poderia mostrar o texto exato do campo como faz com JS.

---

## 5. Desvios do briefing

1. **Arquivos auxiliares não listados, dentro das pastas de frontend:** `src/components/auth/authQuery.ts`, `fields.tsx`, `AuthPageShell.tsx`, `useHydrated.ts`, `passwordRules.ts` e `src/components/testing/authTestUtils.ts`. Motivo: evitar repetir em quatro formulários e quatro páginas a leitura de query, o mapa de mensagens, os campos com `aria-describedby`, a validação da nova senha e os dublês de `fetch`/`location`.
2. **Teste de `redirectToLogin` por `window.location` e não por `vi.mock` parcial.** Em ESM, `apiFetch` chama o `redirectToLogin` do próprio módulo; um `vi.mock` parcial substitui só o que os importadores veem, não a chamada interna, logo o spy nunca seria chamado. O ambiente jsdom do Vitest expõe `location` como acessor configurável em `globalThis`, então `vi.stubGlobal("location", { assign: vi.fn(), … })` funciona e `StoreList.test.tsx` verifica `location.assign` chamado com `/login?motivo=sessao_expirada&next=%2F` e a ausência de `role="alert"` (mesma evidência que o briefing pedia).
3. **Links internos com `<Link>` de `next/link`** (`Esqueci a senha`, `Voltar ao login`, `Pedir um novo link`, `Voltar às lojas`, `Alterar senha`): a regra `@next/next/no-html-link-for-pages` do lint recusa `<a href="/">`. As navegações pós-ação continuam por `window.location.assign/replace` como o briefing manda; em `apiClient.ts` há um `eslint-disable-next-line @next/next/no-location-assign-relative-destination` com o motivo (recarga completa para o Server Component reler o cookie).
4. **`useHydrated` com `useSyncExternalStore`** em vez de `useState` + `useEffect`: a regra `react-hooks/set-state-in-effect` (React Compiler) do lint recusa `setState` síncrono em efeito.
5. **Títulos das páginas diferentes dos rótulos dos botões** para não haver dois elementos com o mesmo texto exato na mesma tela (`getByText` do verificador): `Entrar no RIDS` (botão `Entrar`), `Definir nova senha` (botão `Redefinir senha`), `Alterar a senha` (botão e link `Alterar senha`). `Esqueci a senha` é título só em `/esqueci-senha`, onde não há link com esse texto.
6. **`noValidate` só após a hidratação** e atributos `required`/`type="email"`/`minLength` nos campos: sem JavaScript o navegador valida nativamente; com JavaScript a validação é a nossa, com as mensagens de CA-9/CA-27, e o navegador não trava o envio antes.
7. **`apiFetch` só envia `Content-Type: application/json` quando há corpo** (o `GET /api/stores` não tem); `Accept` vai sempre.
8. **`useApiMutation.submit` durante um envio devolve a promessa em curso** em vez de "ignorar" sem valor, porque a assinatura do briefing exige `Promise<ApiResult<TData>>`. Efeito observável igual: um só pedido.
9. **Mensagens não previstas no briefing:** `Informe a senha atual.` (campo vazio em `/conta/senha`), `Senha redefinida. A levar ao login…` (status momentâneo antes do `replace`), `Verifique os campos e tente de novo.` (`?erro=VALIDATION_ERROR`, como o backend sugeriu) e o texto de apoio em `/esqueci-senha`.
10. **`VALIDATION_ERROR` da API no login** é atribuído ao campo pela mensagem (contém "e-mail" → e-mail; senão → senha); em `/conta/senha`, `Informe a senha.` → senha atual e o resto → nova senha. Na prática a validação local impede que esses erros ocorram com JavaScript.
11. **`export const dynamic = "force-dynamic"` nas páginas**: já seriam dinâmicas por `cookies()`/`searchParams`; ficou explícito como nas rotas.
12. Nenhuma alteração em `src/shared/**`.

---

## 6. Resultado de typecheck, lint e testes

Ordem executada após `npm run format` (Prettier reescreveu só os arquivos novos):

```
$ npm run typecheck   → tsc --noEmit                 OK (sem erros)
$ npm run lint        → eslint .                     OK (0 erros, 0 avisos)
$ npm test            → vitest run
  Test Files  22 passed (22)
  Tests       192 passed (192)      (backend: 138 inalterados; frontend: 54 novos/alterados)
$ npx next build      → Compiled successfully; rotas ƒ /, /conta/senha, /esqueci-senha, /login,
                        /redefinir-senha, /api/auth/*, /api/dev/*, /api/health, /api/stores; ƒ Proxy
```

Nenhum teste do backend foi alterado ou quebrou. Não executado: `npm run test:e2e` (é do `test-verifier` e exige banco/Redis). Sem commit nem push.

---

## 7. Regras que teriam ajudado

1. **"Links entre páginas usam `<Link>` de `next/link`; só as navegações que precisam de recarga completa (após login/logout/redefinição, ou fora de um componente) usam `window.location`, com comentário e `eslint-disable-next-line` justificados."** O lint do Next (`no-html-link-for-pages`, `no-location-assign-relative-destination`) recusa `<a href="/">` e avisa em `location.assign` de caminho relativo; o briefing mandava `window.location` sem distinguir os casos.
2. **"O lint do React Compiler está ativo (`react-hooks/set-state-in-effect`): não chame `setState` diretamente num efeito; para detetar hidratação use `useSyncExternalStore`."**
3. **"Em testes de componente, `window.location` substitui-se com `vi.stubGlobal("location", …)` (o ambiente jsdom do Vitest define `location` como acessor configurável). `vi.mock` parcial não intercepta chamadas internas ao próprio módulo."**
4. **"Constantes usadas pela API e pela UI (regex de tokens, textos de avisos) vivem em `src/shared/`, nunca só em `src/server/`."** Evitaria a duplicação de `TOKEN_PATTERN`.
5. **"Títulos de página não repetem exatamente o texto de um botão ou link da mesma tela"** — o `test-verifier` usa `getByText`/`getByRole` e textos duplicados obrigam a consultas ambíguas.
6. **"Dublês de teste que não são `*.test.*` ficam em `src/<camada>/testing/`"** (o backend usou `src/server/auth/testing/fakes.ts`; espelhei em `src/components/testing/`). Uma convenção escrita evita a dúvida.
7. **"Toda página nova lê `await props.searchParams` e passa props a componentes cliente; formulários não usam `useSearchParams`/`useRouter`"** — está no briefing desta funcionalidade e merece virar regra geral, porque é o que torna os componentes testáveis em jsdom.

---

## Correção 1 (constantes partilhadas)

**Data:** 2026-09-05 · **Origem:** `07-validacao.md`, achado S-1, após a Correção 3 do backend ter criado `src/shared/auth-rules.ts`.

### Arquivos editados

- `src/components/auth/authQuery.ts` — apagados o array local `AUTH_ERROR_CODES` (10 códigos escritos à mão) e a constante `RESET_TOKEN_PATTERN`; `parseAuthErrorCode` e `parseResetToken` passam a usar `AUTH_ERROR_CODES` e `RESET_TOKEN_PATTERN` importados de `@/shared/auth-rules`. A lista partilhada deriva de `Object.keys(AUTH_ERROR_MESSAGES)` + `"VALIDATION_ERROR"`, logo um código novo em `src/shared/types.ts` passa a ser reconhecido em `?erro=` sem edição aqui. `RESET_TOKEN_PATTERN` deixa de ser exportado por este módulo (nenhum importador externo).
- `src/components/auth/passwordRules.ts` — apagados `PASSWORD_MIN_LENGTH = 10` e `PASSWORD_TOO_SHORT_MESSAGE`; ambos vêm de `@/shared/auth-rules`. `PASSWORD_MIN_LENGTH` continua re-exportado daqui porque `ChangePasswordForm.tsx` e `ResetPasswordForm.tsx` o importam de `./passwordRules` para `minLength` dos campos. `PASSWORDS_MISMATCH_MESSAGE` e `validateNewPassword` ficam onde estavam (só a UI os usa).

### Comportamento

Nenhuma alteração de comportamento nem de texto: valores idênticos aos anteriores (`/^[A-Za-z0-9_-]{43}$/`, `10`, `A senha deve ter pelo menos 10 caracteres.`). Os formulários, páginas e testes de componente não precisaram de alteração (os testes verificam o texto literal, não a constante). Nenhum arquivo em `src/shared/**`, `src/server/**` ou `src/app/api/**` foi tocado.

### Feedback para o backend

Nenhum. O módulo `src/shared/auth-rules.ts` só importa `./types` e funciona em componentes cliente e em Server Components.

### Resultado

```
$ npm run format      → Prettier: só os dois arquivos acima reescritos
$ npm run typecheck   → tsc --noEmit                 OK
$ npm run lint        → eslint .                     OK
$ npm test            → vitest run
  Test Files  23 passed (23)
  Tests       207 passed (207)
```

Sem commit nem push.
