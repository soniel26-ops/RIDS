# Briefing técnico — Login do painel

**Estado:** aguardando aprovação (ponto de verificação 2)

**Funcionalidade:** `login-painel` · **História:** `docs/features/login-painel/02-historia.md` (v3, APROVADA, CA-1 a CA-43) · **Descobertas:** `docs/features/login-painel/01-descobertas.md` · **Data:** 2026-09-04

## Resumo para o dono

1. Vamos pôr uma porta no painel: quem abrir o endereço vê uma tela de "Entrar" e só passa com e-mail e senha de uma conta que o técnico criou a seu pedido, com o cargo (Proprietário, Admin ou Marketing) visível no topo, junto do botão "Sair".
2. Quem esquecer a senha pede um link por e-mail; o link vale 1 hora e serve uma vez. Quem está dentro pode trocar a própria senha. Fica um registro de quem entrou e quem mexeu na senha, consultável pelo técnico.
3. Para o e-mail escolhemos o serviço **Resend**. O que você precisa fazer: criar uma conta em resend.com, adicionar o domínio de envio (por exemplo `sonielparis.fr`) e pedir ao técnico para inserir os registros DNS que o Resend indicar; depois criar uma "API key" e entregá-la ao técnico **fora do chat** (ele a coloca no arquivo `.env` do servidor).
4. Custo: o plano gratuito do Resend (na data deste briefing, 100 e-mails/dia e 3.000/mês, 1 domínio) chega para este uso; confirmar no site ao criar a conta. Não há outro custo novo: banco e Redis já eram necessários.
5. Quando o técnico criar a sua conta, você digita a sua senha (mínimo 10 caracteres) diretamente no terminal dele; ela nunca é enviada por e-mail ou chat.
6. A hospedagem em produção ainda não foi decidida; o desenho está pronto para funcionar atrás de qualquer servidor comum, mas há 4 pontos a confirmar quando a hospedagem existir (seção 7, R-5).

---

## 1. Resumo

Constrói-se autenticação por e-mail e senha com sessão em banco (cookie opaco, 7 dias, várias sessões por pessoa), protegendo todas as páginas e todo `/api/*` exceto `/api/health` (CA-1 a CA-6, CA-10 a CA-12, CA-15 a CA-17, CA-19). Acrescentam-se troca de senha autenticada, "esqueci a senha" por link de e-mail via Resend (uso único, 1 hora, só o último vale, revoga as outras sessões), limites de tentativas em Redis e regras de senha (CA-7 a CA-9, CA-13, CA-18, CA-20 a CA-30, CA-34 a CA-38). Cria-se o modelo `User` com cargo obrigatório, um script de linha de comando para criar contas e uma tabela de auditoria com quatro eventos, sem senha nem token (CA-14, CA-21, CA-31 a CA-33, CA-39 a CA-43).

## 2. Alterações no modelo de dados

Migração única, gerada pelo Prisma: `npm run migrate -- --name auth_users_sessions_audit` (o Prisma prefixa o timestamp; nunca escrever o SQL à mão). Depois `npm run db:generate`.

Todas as datas são `DateTime` gravadas em UTC pelo Prisma; nenhuma tabela desta funcionalidade tem `storeId` (exceção documentada em 7, R-1). Nenhuma tabela existente muda. `prisma/seed.ts` **não** muda (regra: nenhuma credencial em seed).

### Enums

| Enum             | Valores                                                                 | Uso                                                                      |
| ---------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `UserRole`       | `OWNER`, `ADMIN`, `MARKETING`                                           | Cargo obrigatório (CA-31). Rótulos na UI: Proprietário, Admin, Marketing |
| `AuthAuditEvent` | `LOGIN_SUCCEEDED`, `LOGIN_FAILED`, `PASSWORD_CHANGED`, `PASSWORD_RESET` | Os quatro eventos aprovados (CA-39 a CA-42)                              |

### `User` — pessoa que entra no painel

| Campo          | Tipo Prisma                                                      | Obrig. | Default      | Notas                                                                                              |
| -------------- | ---------------------------------------------------------------- | ------ | ------------ | -------------------------------------------------------------------------------------------------- |
| `id`           | `String`                                                         | sim    | `cuid()`     | `@id`                                                                                              |
| `email`        | `String`                                                         | sim    | —            | `@unique`. Gravado **sempre normalizado** (`trim().toLowerCase()`). Garante "duplicidade de conta" |
| `passwordHash` | `String`                                                         | sim    | —            | Formato `scrypt$N$r$p$<salt b64>$<hash b64>`. Nunca sai do serviço                                 |
| `role`         | `UserRole`                                                       | sim    | —            | Sem default: o cargo é sempre explícito (CA-31)                                                    |
| `createdAt`    | `DateTime`                                                       | sim    | `now()`      |                                                                                                    |
| `updatedAt`    | `DateTime`                                                       | sim    | `@updatedAt` |                                                                                                    |
| relações       | `sessions Session[]`, `passwordResetTokens PasswordResetToken[]` |        |              |

### `Session` — uma por dispositivo/login (CA-16)

| Campo       | Tipo Prisma                                | Obrig. | Default  | Notas                                                                                       |
| ----------- | ------------------------------------------ | ------ | -------- | ------------------------------------------------------------------------------------------- |
| `id`        | `String`                                   | sim    | `cuid()` | `@id`                                                                                       |
| `userId`    | `String`                                   | sim    | —        | FK `User.id`, `onDelete: Cascade`                                                           |
| `tokenHash` | `String`                                   | sim    | —        | `@unique`. SHA-256 (hex) do token opaco que vai no cookie; o token em claro nunca é gravado |
| `expiresAt` | `DateTime`                                 | sim    | —        | `createdAt + 7 dias`, absoluto, sem renovação deslizante (CA-15)                            |
| `createdAt` | `DateTime`                                 | sim    | `now()`  |                                                                                             |
| índices     | `@@index([userId])` (revogar todas, CA-38) |        |          |

Sair, expiração e revogação **apagam** a linha (não há `revokedAt`): "Sair" é idempotente por `deleteMany`.

### `PasswordResetToken` — link de "esqueci a senha"

| Campo       | Tipo Prisma         | Obrig. | Default  | Notas                                                                           |
| ----------- | ------------------- | ------ | -------- | ------------------------------------------------------------------------------- |
| `id`        | `String`            | sim    | `cuid()` | `@id`                                                                           |
| `userId`    | `String`            | sim    | —        | FK `User.id`, `onDelete: Cascade`                                               |
| `tokenHash` | `String`            | sim    | —        | `@unique`. SHA-256 (hex) do token do link; o token em claro só existe no e-mail |
| `expiresAt` | `DateTime`          | sim    | —        | `createdAt + 1 hora` (CA-34)                                                    |
| `usedAt`    | `DateTime?`         | não    | `null`   | Preenchido de forma condicional ao usar (uso único, "o primeiro ganha")         |
| `createdAt` | `DateTime`          | sim    | `now()`  |                                                                                 |
| índices     | `@@index([userId])` |        |          |

"Só o último vale" (CA-35): ao emitir um novo token, os anteriores do mesmo usuário são apagados na mesma transação. Trocar a senha autenticado também apaga todos (caso extremo "link pedido e senha trocada entretanto").

### `AuthAuditLog` — registro sem tela (CA-39 a CA-43)

| Campo       | Tipo Prisma                                           | Obrig. | Default  | Notas                                                                                 |
| ----------- | ----------------------------------------------------- | ------ | -------- | ------------------------------------------------------------------------------------- |
| `id`        | `String`                                              | sim    | `cuid()` | `@id`                                                                                 |
| `event`     | `AuthAuditEvent`                                      | sim    | —        |                                                                                       |
| `email`     | `String`                                              | sim    | —        | E-mail normalizado, mesmo sem conta (CA-40)                                           |
| `userId`    | `String?`                                             | não    | `null`   | **Sem FK** (o registro sobrevive a remoção de conta). `null` para e-mail desconhecido |
| `reason`    | `String?`                                             | não    | `null`   | Só em `LOGIN_FAILED`: `INVALID_CREDENTIALS` ou `RATE_LIMITED`. Nunca outro conteúdo   |
| `createdAt` | `DateTime`                                            | sim    | `now()`  | Instante em UTC (CA-39)                                                               |
| índices     | `@@index([email, createdAt])`, `@@index([createdAt])` |        |          |

Não existe coluna para senha, token, cookie, IP ou user-agent (CA-43). Consulta pelo técnico: SQL direto (`SELECT event, email, reason, "createdAt" FROM "AuthAuditLog" ORDER BY "createdAt" DESC`).

### Captura de e-mail em desenvolvimento — **sem tabela**

O transporte "capturado" grava em Redis (`LPUSH dev:outbox:<email normalizado>`, `EXPIRE 3600`), não em PostgreSQL, para não deixar uma tabela só de desenvolvimento no esquema de produção. Ver 3.6 e 4.7.

## 3. Fluxo do processo

Convenções usadas em todos os fluxos:

- `emailNorm = email.trim().toLowerCase()` (caso extremo "maiúsculas ou espaços"). A senha é comparada exatamente como digitada.
- Hash de senha: `scrypt` de `node:crypto`, `N=2^15, r=8, p=1, keylen=64, maxmem=64 MiB`, salt de 16 bytes; parâmetros gravados no próprio hash para permitir subir custo depois. Comparação com `timingSafeEqual`.
- Tokens (sessão e redefinição): `randomBytes(32)` em base64url (43 caracteres); no banco só `createHash("sha256")` em hex.
- Limites em Redis via `getRedisConnection()`: chaves `auth:login-fail:<emailNorm>` e `auth:reset-req:<emailNorm>`; `INCR` (atómico: duas tentativas simultâneas contam ambas) e `EXPIRE 900` quando o resultado do `INCR` é 1 (janela fixa de 15 minutos a partir da primeira falha, sem renovação nas seguintes). Bloqueado quando `GET >= 5`. Toda chamada ao Redis é envolvida num timeout de 2 s (ver R-3); timeout ou erro → **falha fechada**: `AUTH_UNAVAILABLE` 503.
- Auditoria: `audit.record(...)` nunca lança; falha vai para `console.error("auditoria falhou", message)` sem o conteúdo do evento (caso extremo "auditoria quando o registro falha").
- Relógio injetado (`now: () => Date`) em todos os serviços, para os testes de fronteira de expiração.

### 3.1 Acesso a página protegida (CA-1, CA-11, CA-12)

1. `src/proxy.ts` (verificação **otimista**, sem banco): caminho público → segue. Caminho protegido sem cookie `rids_session` → se começa por `/api/` responde `401` JSON `{ error: { code: "UNAUTHENTICATED", message: "Sessão necessária." } }`; senão redireciona 307 para `/login?next=<pathname+search codificados>`. Com cookie → segue (não valida).
2. A página protegida (Server Component) chama `const user = await requirePageUser({ next: "/rota-desta-página" })` como **primeira** instrução. O helper lê o cookie com `cookies()`, chama `authService.resolveSession(token)`; se inválido/expirado/inexistente → `redirect("/login?motivo=sessao_expirada&next=...")`; se sem cookie → `redirect("/login?next=...")`. Cookie inválido **não** é apagado aqui (proibido durante renderização); é substituído no próximo login e apagado no próximo 401 de API.
3. A página renderiza `<PanelHeader user={user} />` e o conteúdo. Nenhum dado de loja é renderizado antes do passo 2 (evita o "meia página com erro").

Caminhos públicos do proxy (constantes no arquivo): `/login`, `/esqueci-senha`, `/redefinir-senha`, `/api/health`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/forgot-password`, `/api/auth/reset-password`, e `/api/dev/*` **só** quando `process.env.NODE_ENV !== "production"`. `matcher` constante que exclui `_next/static`, `_next/image`, `favicon.ico` e qualquer caminho com extensão de arquivo.

### 3.2 Login (CA-2, CA-7, CA-8, CA-9, CA-13, CA-18, CA-39, CA-40)

1. `POST /api/auth/login` lê o corpo (JSON ou `application/x-www-form-urlencoded`, ver 4.0), valida com `loginSchema`. Falha → `400 VALIDATION_ERROR`; **não** conta nem audita (CA-9, CA-40).
2. `authService.login({ email, password })`:
   a. normaliza; se `auth:login-fail` bloqueado → `audit(LOGIN_FAILED, reason RATE_LIMITED)`; lança `TOO_MANY_ATTEMPTS`.
   b. busca `User` por `email`; verifica a senha contra `passwordHash` **ou contra um hash fixo de sacrifício** quando não há conta, para tempo equivalente (CA-8).
   c. sem conta ou senha errada → `INCR` na chave; `audit(LOGIN_FAILED, reason INVALID_CREDENTIALS, userId ou null)`; lança `INVALID_CREDENTIALS`.
   d. sucesso → `DEL` na chave; gera token; cria `Session { tokenHash, expiresAt: now + 7d }`; `audit(LOGIN_SUCCEEDED)`; devolve `{ user: CurrentUser, token, expiresAt }`.
   e. erro de banco/Redis → lança `AUTH_UNAVAILABLE` (CA-13).
3. A rota grava o cookie `rids_session=<token>; HttpOnly; SameSite=Lax; Path=/; Expires=<expiresAt>; Secure` (Secure só com `NODE_ENV=production`) e responde (JSON `200 { user }` ou 303 para `next` seguro).
4. Frontend: navega para `toSafeInternalPath(next)` (`/` se ausente/inválido) com recarga completa.

### 3.3 Chamada a `/api/*` protegida (CA-4, CA-10, CA-11)

1. Proxy: sem cookie → 401 (3.1).
2. Rota: `const auth = await authenticateApiRequest(request); if (!auth.ok) return auth.response;` — o helper resolve a sessão; inválida → `401 UNAUTHENTICATED` **com `Set-Cookie` que apaga** `rids_session`. Só depois a rota chama o serviço de negócio (`GET /api/stores` continua a listar todas as lojas para qualquer cargo, CA-19).
3. Frontend (`apiFetch`): resposta com `error.code === "UNAUTHENTICATED"` → `redirectToLogin("sessao_expirada")` (`window.location.assign("/login?motivo=sessao_expirada&next=<pathname atual>")`) e o hook **fica em `loading`** (nada de mensagem técnica).

### 3.4 Sair (CA-5, CA-16, caso "sair duas vezes")

`POST /api/auth/logout` é público no proxy; lê o cookie se existir, `authService.logout(token)` faz `session.deleteMany({ tokenHash })` (0 ou 1 linha, sem erro), apaga o cookie e responde `204` (JSON) ou 303 `/login` (formulário). Frontend: `window.location.replace("/login")`.

### 3.5 Trocar senha autenticado (CA-22, CA-26, CA-27, CA-37, CA-41)

1. `authenticateApiRequest` (sessão expirada → 3.3). Valida `changePasswordSchema`.
2. `authService.changePassword({ userId, currentPassword, newPassword })`: bloqueado em `auth:login-fail:<email do usuário>` → `TOO_MANY_ATTEMPTS`; senha atual errada → `INCR` na **mesma** chave do login (CA-26) e lança `INVALID_CURRENT_PASSWORD`; certa → `DEL` na chave, atualiza `passwordHash`, `passwordResetToken.deleteMany({ userId })`, `audit(PASSWORD_CHANGED)`. **Não** toca em `Session` (CA-37).
3. Resposta `200 { ok: true }`; a sessão atual continua (CA-22).

### 3.6 Esqueci a senha (CA-24, CA-28, CA-30, CA-36)

1. `POST /api/auth/forgot-password` público; valida `forgotPasswordSchema` (só e-mail).
2. `authService.requestPasswordReset({ email })`:
   a. normaliza; `auth:reset-req` bloqueado → lança `TOO_MANY_ATTEMPTS` (igual para existente e inexistente, CA-36); senão `INCR` (conta o pedido).
   b. marca `t0`; chama `mailTransport.ping()` (Resend: `GET /domains`; capturado: no-op). Falha → `MAIL_UNAVAILABLE`.
   c. busca `User`. Se existe: gera token, monta o link `${scheme}://${APP_HOST}/redefinir-senha?token=<token>` (`scheme` = `https` em produção, `http` fora), chama `mailTransport.send(...)`; falha → `MAIL_UNAVAILABLE` **antes** de persistir, logo nenhum link fica válido (CA-30). Sucesso → transação: `deleteMany({ userId })` + `create { tokenHash, expiresAt: now + 1h }` (CA-35).
   d. Se não existe: nada (nenhum e-mail sai, CA-28).
   e. Em ambos os casos, espera até completar `FORGOT_MIN_RESPONSE_MS = 800` desde `t0` (tempo equalizado; alternativa descartada em R-6).
3. Resposta `200 { ok: true }` sempre que não houve 429/503; a UI mostra a frase neutra de CA-24.

E-mail: assunto `Redefinir a senha do RIDS`; texto simples com o link, "válido por 1 hora, uso único", "se não pediu, ignore". Sem hora absoluta (evita fuso), sem nome, sem senha.

### 3.7 Redefinir pela ligação (CA-25, CA-29, CA-34, CA-35, CA-38, CA-42)

1. `POST /api/auth/reset-password` público; `token` fora do formato base64url/43 chars → `400 INVALID_RESET_TOKEN` (mesma mensagem de CA-29, sem detalhe); `newPassword` < 10 → `400 VALIDATION_ERROR`.
2. `authService.resetPassword({ token, newPassword })`, em transação:
   a. `findUnique({ tokenHash })`; ausente, `usedAt` não nulo ou `expiresAt <= now` → `INVALID_RESET_TOKEN`.
   b. `updateMany({ where: { id, usedAt: null }, data: { usedAt: now } })`; `count !== 1` → `INVALID_RESET_TOKEN` (o primeiro navegador ganha).
   c. `user.update({ passwordHash })`; `session.deleteMany({ userId })` (CA-38); `passwordResetToken.deleteMany({ userId })`.
3. Fora da transação: `audit(PASSWORD_RESET)`; `DEL auth:login-fail:<email>` (caso extremo "zera a contagem").
4. Resposta `200 { ok: true }` ou 303 `/login?motivo=senha_redefinida`. A UI leva a `/login?motivo=senha_redefinida`; o cookie local, se existir, aponta para uma sessão apagada e é tratado como inválido (CA-11/CA-38).

### 3.8 Criar conta (CA-14, CA-20, CA-31, CA-32, "duplicidade")

`npm run auth:create-user -- --email <e-mail> --role OWNER|ADMIN|MARKETING` (script `tsx src/server/auth/cli/create-user.ts`, importa `dotenv/config` como `prisma/seed.ts`). Pede a senha duas vezes no terminal **sem eco** (`node:readline` com saída silenciada), exige coincidência e mínimo de 10, chama `authService.createUser({ email, role, password })`. E-mail duplicado (normalizado) → mensagem "já existe uma conta com este e-mail" e código de saída 1. Nunca imprime a senha; imprime só e-mail e cargo criados. Sem seed, sem variável de ambiente com senha.

### 3.9 Desenvolvimento e aceitação (sem serviço real)

- `MAIL_TRANSPORT=captured` (default quando `NODE_ENV !== "production"`; em produção só `resend` é aceito e a ausência de `RESEND_API_KEY`/`MAIL_FROM` lança no primeiro uso).
- `GET /api/dev/outbox?to=<e-mail>` devolve as mensagens capturadas para o destinatário; `POST /api/dev/test-user` cria/repõe um usuário de teste e limpa sessões, tokens e contadores dele. Ambas respondem `404 NOT_FOUND` quando `NODE_ENV === "production"` e são públicas no proxy só fora de produção (justificativa em R-7).

Não há jobs, filas nem workers novos nesta funcionalidade.

## 4. Alterações na API

### 4.0 Convenções

- Todos os handlers são **Route Handlers** em `src/app/api/auth/*`. Decisão e motivos: (1) contrato único `ApiError` para hooks e para `/api/stores` (CA-11 precisa de um 401 JSON reconhecível; Server Actions não devolvem isso); (2) o padrão documentado em `CLAUDE.md` é "rota fina → serviço" e "chamadas à API passam por hooks"; Server Actions não estão no livro de regras; (3) Server Actions exigiriam `serverActions.allowedOrigins` atrás de um reverse proxy — hospedagem ainda indefinida; (4) testáveis com o fixture `request` do Playwright. Alternativa descartada: Server Actions (melhor progressividade nativa, mas os três motivos acima pesam mais).
- **Progressividade sem JavaScript** (caso extremo): cada `POST` aceita `Content-Type: application/json` **e** `application/x-www-form-urlencoded`. O helper `readAuthBody(request)` devolve um objeto plano para o mesmo esquema Zod; `respondAuth(request, outcome)` responde JSON quando o corpo veio em JSON, e `303` para uma URL de página quando veio de formulário nativo (sucesso → destino; erro → mesma página com `?erro=<AuthErrorCode>`). Nada disto muda a lógica: a rota continua fina.
- **Verificação de origem**: em todo `POST` de `/api/auth/*`, se o cabeçalho `Origin` estiver presente e o seu host não coincidir com `Host` nem com `X-Forwarded-Host` → `403 FORBIDDEN_ORIGIN`. Se `Origin` estiver ausente, segue (formulários nativos same-origin enviam `Origin`; ferramentas HTTP não). `SameSite=Lax` já impede o envio do cookie em POST cross-site; isto é defesa em profundidade contra login-CSRF.
- Erros seguem `ApiError` (`src/shared/types.ts`) com `code: AuthErrorCode`. Erros internos: só `error.message` no `console.error`, nunca e-mail, senha, token ou cookie. `export const dynamic = "force-dynamic"` em todas.
- **Textos exatos das mensagens de erro** (o frontend exibe `error.message` tal como vem; o test-verifier usa-os):

| `AuthErrorCode`            | HTTP | `message`                                                                                                                      | Quando                                                  |
| -------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `VALIDATION_ERROR`         | 400  | mensagem do primeiro problema Zod (ex.: `A senha deve ter pelo menos 10 caracteres.`, `Informe o e-mail.`, `E-mail inválido.`) | corpo inválido (CA-9, CA-20, CA-27)                     |
| `INVALID_CREDENTIALS`      | 401  | `E-mail ou senha incorretos`                                                                                                   | CA-7, CA-8                                              |
| `TOO_MANY_ATTEMPTS`        | 429  | `Muitas tentativas. Aguarde alguns minutos e tente de novo.`                                                                   | CA-18, CA-36                                            |
| `UNAUTHENTICATED`          | 401  | `Sessão necessária.`                                                                                                           | sem sessão, sessão inválida ou expirada (CA-10 a CA-12) |
| `INVALID_CURRENT_PASSWORD` | 400  | `Senha atual incorreta`                                                                                                        | CA-26                                                   |
| `INVALID_RESET_TOKEN`      | 400  | `Este link é inválido ou expirou; peça um novo`                                                                                | CA-29, CA-34, CA-35                                     |
| `MAIL_UNAVAILABLE`         | 503  | `Não foi possível enviar agora, tente mais tarde.`                                                                             | CA-30                                                   |
| `AUTH_UNAVAILABLE`         | 503  | `O serviço está indisponível de momento. Tente mais tarde.`                                                                    | banco ou Redis fora (CA-13)                             |
| `FORBIDDEN_ORIGIN`         | 403  | `Origem do pedido não permitida.`                                                                                              | ver acima                                               |
| `NOT_FOUND`                | 404  | `Não encontrado.`                                                                                                              | rotas `/api/dev/*` em produção                          |

Esquemas Zod (Zod 4; `z.email()` é função de topo):

```ts
const emailField = z
  .string()
  .trim()
  .min(1, "Informe o e-mail.")
  .max(254, "E-mail inválido.")
  .pipe(z.email("E-mail inválido."));
const passwordField = z.string().min(1, "Informe a senha.").max(1024, "Senha demasiado longa.");
const newPasswordField = z
  .string()
  .min(10, "A senha deve ter pelo menos 10 caracteres.")
  .max(1024, "Senha demasiado longa.");

export const loginSchema = z.object({
  email: emailField,
  password: passwordField,
  next: z.string().max(2048).optional(),
});
export const changePasswordSchema = z.object({
  currentPassword: passwordField,
  newPassword: newPasswordField,
});
export const forgotPasswordSchema = z.object({ email: emailField });
export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  newPassword: newPasswordField,
});
export const roleSchema = z.enum(["OWNER", "ADMIN", "MARKETING"]);
```

(`max(1024)` na senha evita `scrypt` sobre entradas de milhares de caracteres.) Em `resetPasswordSchema`, falha em `token` mapeia para `INVALID_RESET_TOKEN`, não para `VALIDATION_ERROR`.

### 4.1 `POST /api/auth/login` — público

- Requisição: `loginSchema`. Formulário nativo envia também `next` (campo oculto).
- Sucesso `200`: `{ user: CurrentUser }` + `Set-Cookie: rids_session=...` (atributos em 3.2). Formulário: `303 Location: <toSafeInternalPath(next)>`.
- Erros: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `429 TOO_MANY_ATTEMPTS`, `503 AUTH_UNAVAILABLE`, `403 FORBIDDEN_ORIGIN`. Formulário: `303 /login?erro=<code>&next=<next>`.
- Nunca inclui a senha nem o token no corpo (CA-21).

### 4.2 `POST /api/auth/logout` — público no proxy, idempotente

- Requisição: sem corpo (JSON `{}` ou formulário vazio).
- Sucesso: `204` sem corpo + `Set-Cookie` que apaga `rids_session`. Formulário: `303 /login`.
- Erros: `503 AUTH_UNAVAILABLE` (banco fora); `403 FORBIDDEN_ORIGIN`.

### 4.3 `POST /api/auth/change-password` — sessão obrigatória

- `authenticateApiRequest(request)` primeiro; falha → `401 UNAUTHENTICATED` (cookie apagado).
- Requisição: `changePasswordSchema`.
- Sucesso `200`: `{ ok: true }`. Formulário: `303 /conta/senha?ok=1`.
- Erros: `400 VALIDATION_ERROR`, `400 INVALID_CURRENT_PASSWORD`, `429 TOO_MANY_ATTEMPTS`, `503 AUTH_UNAVAILABLE`. Formulário: `303 /conta/senha?erro=<code>`.

### 4.4 `POST /api/auth/forgot-password` — público

- Requisição: `forgotPasswordSchema`.
- Sucesso `200`: `{ ok: true }` (existente ou não). Formulário: `303 /esqueci-senha?enviado=1`.
- Erros: `400 VALIDATION_ERROR`, `429 TOO_MANY_ATTEMPTS`, `503 MAIL_UNAVAILABLE`, `503 AUTH_UNAVAILABLE`. Formulário: `303 /esqueci-senha?erro=<code>`.

### 4.5 `POST /api/auth/reset-password` — público

- Requisição: `resetPasswordSchema` (formulário nativo envia `token` em campo oculto).
- Sucesso `200`: `{ ok: true }`. Formulário: `303 /login?motivo=senha_redefinida`.
- Erros: `400 INVALID_RESET_TOKEN`, `400 VALIDATION_ERROR`, `503 AUTH_UNAVAILABLE`. Formulário: `303 /redefinir-senha?token=<token>&erro=<code>`.

### 4.6 `GET /api/stores` — passa a exigir sessão (alteração)

Acrescenta `authenticateApiRequest(request)` antes de chamar `createStoreService(prisma).listStores()`; assinatura passa a `GET(request: NextRequest)`. Resposta de sucesso inalterada (`StoreSummary[]`), sem filtro por cargo (CA-19). Novo erro: `401 UNAUTHENTICATED`. Remover o comentário "Pendente: autenticação do painel".

### 4.7 Rotas só de desenvolvimento — `src/app/api/dev/*`

Ambas: se `process.env.NODE_ENV === "production"` → `404 NOT_FOUND` antes de qualquer coisa. Fora de produção, públicas no proxy.

- `GET /api/dev/outbox?to=<e-mail>` → `200 { messages: Array<{ to: string; subject: string; text: string; createdAt: string }> }`, mais recente primeiro (`LRANGE dev:outbox:<emailNorm> 0 -1`). `to` ausente → `400 VALIDATION_ERROR`.
- `POST /api/dev/test-user` corpo `{ email, password, role? = "OWNER" }` (mesmos campos/regras de `createUser`) → `200 { id, email, role }`. Se já existir: atualiza hash e cargo, apaga `Session` e `PasswordResetToken` do usuário; em ambos os casos `DEL` das duas chaves Redis do e-mail.

### 4.8 `GET /api/health` — inalterado, público (CA-17)

## 5. Alterações no frontend

Todas as páginas novas são Server Components (`src/app/**/page.tsx`) que leem `await props.searchParams` (no Next 16 é uma `Promise`) e passam **props** aos formulários cliente; os formulários **não** usam `useSearchParams`/`useRouter` (para serem testáveis em jsdom sem contexto do App Router). Navegações pós-ação usam `window.location.assign/replace` (recarga completa, para o Server Component reler o cookie).

Textos fixos da UI (contrato com o test-verifier): botões `Entrar`/`A entrar…`, `Sair`, `Alterar senha`/`A alterar…`, `Enviar link`/`A enviar…`, `Redefinir senha`/`A redefinir…`; avisos `A sua sessão terminou. Entre de novo.` (`motivo=sessao_expirada`), `Senha redefinida. Entre com a nova senha.` (`motivo=senha_redefinida`), `Senha alterada com sucesso.` (troca), frase neutra exata de CA-24 (`Se existir uma conta com este e-mail, enviámos um link para redefinir a senha`); rótulos de cargo `Proprietário` / `Admin` / `Marketing` (`USER_ROLE_LABELS`).

### 5.1 `src/hooks/apiClient.ts` (novo) — base de todos os hooks

- `apiFetch<T>(input: string, init?: RequestInit): Promise<ApiResult<T>>` com `ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiError["error"] }`. Envia `Content-Type: application/json` e `Accept: application/json`; corpo não-JSON ou rede fora → `{ ok: false, status: 0, error: { code: "AUTH_UNAVAILABLE", message: <texto genérico> } }`.
- Se `error.code === "UNAUTHENTICATED"` → chama `redirectToLogin("sessao_expirada")` e devolve uma promessa que **nunca resolve** (o chamador fica em `loading`; CA-11 sem erro técnico). A decisão é pelo **código**, não pelo status: o `401 INVALID_CREDENTIALS` do login não redireciona.
- `redirectToLogin(motivo: "sessao_expirada"): void` → `window.location.assign("/login?motivo=sessao_expirada&next=" + encodeURIComponent(pathname + search))`. Exportada separadamente para ser mockável nos testes.

### 5.2 `src/hooks/useApiMutation.ts` (novo)

`useApiMutation<TBody, TData>(path: string): { state: MutationState<TData>; submit(body: TBody): Promise<ApiResult<TData>> }` com `MutationState = { status: "idle" } | { status: "submitting" } | { status: "success"; data } | { status: "error"; error: ApiError["error"] }`. Ignora `submit` enquanto `submitting` (sem duplo envio).

### 5.3 `src/hooks/useStores.ts` (alteração)

Passa a usar `apiFetch`. Comportamento novo: `UNAUTHENTICATED` → redirecionamento e estado permanece `loading`. Demais erros inalterados (`503` continua a mostrar a mensagem da API). Tipo `StoresState` inalterado.

### 5.4 Página `/login` — `src/app/login/page.tsx` + `src/components/auth/LoginForm.tsx`

- Página: `const user = await getCurrentUser(); if (user) redirect("/")` (CA-6, verificação real, não otimista). Lê `next`, `motivo`, `erro`; passa `next={toSafeInternalPath(next)}`, `notice`, `initialErrorCode`.
- `LoginForm` (`"use client"`): `<form method="post" action="/api/auth/login">` com campos `email`, `password`, oculto `next`; `onSubmit` intercepta e usa `useApiMutation("/api/auth/login")`. Validação local antes de enviar (CA-9: `Informe o e-mail.`, `Informe a senha.`, `E-mail inválido.` junto ao campo, `aria-describedby`, `fetch` não chamado). Estados: `idle`, `submitting` (botão desabilitado com `A entrar…`, `aria-busy`), `error` (`role="alert"` com `error.message`; para `VALIDATION_ERROR` mostra a mensagem no campo), sucesso → `window.location.assign(next)`. Aviso de `motivo` em `role="status"`. **Sem** link "criar conta" (CA-14); com link `Esqueci a senha` para `/esqueci-senha`.
- Sem JavaScript: o `action` nativo envia o formulário; a página volta com `?erro=` e renderiza a mensagem via `initialErrorCode` → `AUTH_ERROR_MESSAGES[code]` (mapa em `src/shared/types.ts`, ver seção 9).

### 5.5 Página `/esqueci-senha` — `src/app/esqueci-senha/page.tsx` + `src/components/auth/ForgotPasswordForm.tsx`

Formulário nativo `action="/api/auth/forgot-password"`; JS via `useApiMutation`. Estados: `idle`, `submitting` (`A enviar…`), `success` (frase neutra de CA-24 em `role="status"`, campo limpo), `error` (`role="alert"`: 429 e 503 com a mensagem da API). Props `sent` (`?enviado=1`) e `initialErrorCode`. Link `Voltar ao login`.

### 5.6 Página `/redefinir-senha` — `src/app/redefinir-senha/page.tsx` + `src/components/auth/ResetPasswordForm.tsx`

Página lê `token` e `erro`. Sem `token` ou formato inválido → renderiza só a mensagem de CA-29 e link para `/esqueci-senha` (não chama a API). Com token: formulário nativo `action="/api/auth/reset-password"`, campos `newPassword`, `confirmPassword` (validação local de igualdade e mínimo 10: `A senha deve ter pelo menos 10 caracteres.`, `As senhas não coincidem.`), oculto `token`. Sucesso → `window.location.replace("/login?motivo=senha_redefinida")`. Erros: `INVALID_RESET_TOKEN` (mensagem + link para pedir novo), `VALIDATION_ERROR`, `AUTH_UNAVAILABLE`.

### 5.7 Página `/conta/senha` — `src/app/conta/senha/page.tsx` + `src/components/auth/ChangePasswordForm.tsx`

Página protegida: `const user = await requirePageUser({ next: "/conta/senha" })`; renderiza `<PanelHeader user={user} />` e o formulário. Props `ok` (`?ok=1`) e `initialErrorCode`. Formulário nativo `action="/api/auth/change-password"`, campos `currentPassword`, `newPassword`, `confirmPassword`. Sucesso → `Senha alterada com sucesso.` em `role="status"`, campos limpos, **sem** navegação (CA-22). Erros: `INVALID_CURRENT_PASSWORD` (`Senha atual incorreta`), `VALIDATION_ERROR`, `TOO_MANY_ATTEMPTS`, `AUTH_UNAVAILABLE`; `UNAUTHENTICATED` é tratado pelo `apiFetch` (redireciona). Link `Voltar às lojas`.

### 5.8 `src/components/PanelHeader.tsx` (novo, `"use client"`) — CA-23

Props `{ user: CurrentUser }`. Mostra `RIDS`, o e-mail, o cargo via `USER_ROLE_LABELS[user.role]`, link `Alterar senha` → `/conta/senha`, e `<form method="post" action="/api/auth/logout">` com botão `Sair` (JS: `useApiMutation("/api/auth/logout")` → `window.location.replace("/login")`; estado `A sair…`). Sem estado vazio/erro (recebe o usuário já resolvido; erro de logout → tenta `replace("/login")` de qualquer forma, o cookie será rejeitado no servidor).

### 5.9 `src/app/page.tsx` (alteração)

Primeira instrução: `const user = await requirePageUser({ next: "/" })`. Substitui o `<header>` atual por `<PanelHeader user={user} />`. Resto igual (`StoreList` com os quatro estados existentes; "nenhuma loja" continua a ser o estado vazio).

### 5.10 `?next=` (CA-2, caso "página pedida antes do login")

`toSafeInternalPath(value)` em `src/shared/safe-path.ts` (backend cria; frontend consome): aceita só strings que começam por `/`, não começam por `//` ou `/\`, não contêm `\`, `\r`, `\n`, nem esquema (`:` antes da primeira `/`?); devolve `/` para tudo o resto. Usada no servidor (303 do formulário nativo) e no cliente (navegação após login). Página inexistente em `next` → o Next mostra o 404 normal já autenticado.

## 6. Testes necessários

Convenções: unitários e de componente em Vitest ao lado do código; aceitação em Playwright (`tests/e2e/auth-*.spec.ts`), nomes `CA-<n>: descrição`. **Testes de rota em Vitest não são viáveis** (as rotas importam `@/server/db`, que lança sem `DATABASE_URL`); as rotas são provadas por aceitação, os serviços por unitários com repositório falso (`vi.fn()`), Redis falso em memória e relógio injetado.

**Infraestrutura de aceitação** (`tests/e2e/helpers/auth.ts`): `uniqueEmail(prefix)` → `${prefix}-${Date.now()}-${random}@exemplo.test` (isola testes paralelos e evita partilhar contadores); `createTestUser(request, { email, password, role })` → `POST /api/dev/test-user`; `loginViaApi(request|context, email, password)`; `readOutbox(request, email)` → `GET /api/dev/outbox?to=`; `extractResetPath(text)` → extrai `/redefinir-senha?token=...` do texto e navega **relativo ao `baseURL`** (o link é montado com `APP_HOST=localhost:3000`, o Playwright usa `127.0.0.1:3000`). Não há acesso a banco de produção: tudo passa pelo servidor de dev com `MAIL_TRANSPORT=captured` e o banco/Redis do `docker compose` (lojas semeadas por `npm run db:seed`).

**Arquivos existentes:**

- `tests/e2e/health.spec.ts`: **inalterado** (`/api/health` continua público); `auth-api.spec.ts` acrescenta o CA-17 explícito sem cookie.
- `src/components/StoreList.test.tsx`: mantém os 4 casos; acrescenta `401 UNAUTHENTICATED redireciona para o login sem mostrar erro` (mock de `redirectToLogin` com `vi.mock("@/hooks/apiClient", ...)` parcial; espera `redirectToLogin` chamado com `"sessao_expirada"` e ausência de `role="alert"`).
- `playwright.config.ts`: acrescentar `webServer.env: { MAIL_TRANSPORT: "captured" }` (Playwright mescla com `process.env`); resto igual. Testes sem JS usam `test.use({ javaScriptEnabled: false })` dentro do spec, sem projeto novo.

### Mapa CA → teste

| CA    | Tipo                   | Arquivo                                                                                                        | O que prova                                                                                                                                          |
| ----- | ---------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-1  | aceitação + unitário   | `tests/e2e/auth-login.spec.ts`; `src/proxy.test.ts`                                                            | Anônimo em `/` → URL final `/login?next=%2F`, corpo sem nomes de lojas; proxy redireciona sem cookie                                                 |
| CA-2  | aceitação + unitário   | `auth-login.spec.ts`; `src/shared/safe-path.test.ts`                                                           | Login em `/login?next=/conta/senha` → `/conta/senha`; sem `next` → `/`; `toSafeInternalPath` rejeita `//evil`, `https://`, `\`                       |
| CA-3  | aceitação              | `auth-login.spec.ts`                                                                                           | Login, `context.storageState()` → novo contexto → `/` mostra lojas sem redirecionar                                                                  |
| CA-4  | aceitação              | `tests/e2e/auth-api.spec.ts`                                                                                   | Com cookie, `GET /api/stores` → 200 array                                                                                                            |
| CA-5  | aceitação              | `auth-login.spec.ts`                                                                                           | `Sair` → `/login`; `goto("/")` → login; `/api/stores` → 401                                                                                          |
| CA-6  | aceitação              | `auth-login.spec.ts`                                                                                           | Autenticado, `goto("/login")` → `/`                                                                                                                  |
| CA-7  | aceitação + unitário   | `auth-login.spec.ts`; `src/server/auth/auth.service.test.ts`                                                   | Texto `E-mail ou senha incorretos`; serviço lança `INVALID_CREDENTIALS` e incrementa contador                                                        |
| CA-8  | aceitação + unitário   | idem                                                                                                           | Mesmo texto para e-mail desconhecido; serviço verifica contra hash de sacrifício (`verify` chamado mesmo sem usuário)                                |
| CA-9  | componente + unitário  | `src/components/auth/LoginForm.test.tsx`; `src/server/auth/schemas.test.ts`                                    | Vazio/inválido → mensagem no campo e `fetch` não chamado; `loginSchema` rejeita                                                                      |
| CA-10 | aceitação + unitário   | `auth-api.spec.ts`; `src/proxy.test.ts`                                                                        | Sem cookie `GET /api/stores` → 401 `UNAUTHENTICATED`, corpo sem `domain`                                                                             |
| CA-11 | componente + aceitação | `StoreList.test.tsx`; `auth-login.spec.ts`                                                                     | 401 → `redirectToLogin`, sem alert; e2e: login, `POST /api/dev/test-user` (apaga sessões), `goto("/")` → `/login?motivo=sessao_expirada` com o aviso |
| CA-12 | aceitação              | `auth-api.spec.ts`                                                                                             | Cookie `rids_session=lixo` → `/api/stores` 401 e `Set-Cookie` de remoção; `/` → login                                                                |
| CA-13 | unitário + componente  | `auth.service.test.ts`; `LoginForm.test.tsx`                                                                   | Repositório lança → `AUTH_UNAVAILABLE`; 503 → mensagem genérica, sem texto do erro interno                                                           |
| CA-14 | aceitação              | `auth-login.spec.ts`                                                                                           | `/login` não contém "criar conta"/"registar"; `GET /api/auth/register` → 404                                                                         |
| CA-15 | unitário               | `auth.service.test.ts`                                                                                         | `resolveSession` com relógio em `+7d-1s` → usuário; em `+7d` → `null` e sessão apagada                                                               |
| CA-16 | aceitação              | `auth-login.spec.ts`                                                                                           | Dois contextos; `Sair` num; outro `/api/stores` 200                                                                                                  |
| CA-17 | aceitação + unitário   | `auth-api.spec.ts` (+ `health.spec.ts` existente); `src/proxy.test.ts`                                         | `/api/health` 200 sem cookie; proxy deixa passar                                                                                                     |
| CA-18 | aceitação + unitário   | `auth-login.spec.ts`; `src/server/auth/rate-limit.test.ts`, `auth.service.test.ts`                             | 5 erros → 6ª com senha certa 429 e texto; unitário: TTL expirado libera; `INCR`/`EXPIRE` só no primeiro; sucesso após 4 falhas zera                  |
| CA-19 | aceitação              | `auth-api.spec.ts`                                                                                             | Usuário `MARKETING` lista as 2 lojas semeadas                                                                                                        |
| CA-20 | unitário + aceitação   | `schemas.test.ts`, `auth.service.test.ts` (`createUser`); `tests/e2e/auth-password.spec.ts`                    | 9 chars recusado, 10 aceito, espaços contam                                                                                                          |
| CA-21 | aceitação + unitário   | `auth-login.spec.ts`, `auth-password.spec.ts`, `tests/e2e/auth-reset.spec.ts`; `src/server/auth/audit.test.ts` | Corpos de todas as respostas e o texto do e-mail capturado não contêm a senha usada                                                                  |
| CA-22 | aceitação              | `auth-password.spec.ts`                                                                                        | Troca → `Senha alterada com sucesso.`; `/api/stores` ainda 200; após `Sair`, antiga recusada com CA-7, nova entra                                    |
| CA-23 | aceitação + componente | `auth-login.spec.ts`; `src/components/PanelHeader.test.tsx`                                                    | Cabeçalho com e-mail, `Proprietário`, `Sair`                                                                                                         |
| CA-24 | aceitação + unitário   | `auth-reset.spec.ts`; `auth.service.test.ts`                                                                   | Frase neutra; outbox tem 1 mensagem com `/redefinir-senha?token=`; unitário: `expiresAt = now + 1h`                                                  |
| CA-25 | aceitação              | `auth-reset.spec.ts`                                                                                           | Abrir link, nova senha → `/login?motivo=senha_redefinida`; reabrir link → CA-29; nova entra, antiga não                                              |
| CA-26 | aceitação + unitário   | `auth-password.spec.ts`; `auth.service.test.ts`                                                                | `Senha atual incorreta`, ainda autenticado; unitário: incrementa `auth:login-fail:<email>`                                                           |
| CA-27 | componente + aceitação | `src/components/auth/ChangePasswordForm.test.tsx`, `ResetPasswordForm.test.tsx`; `auth-password.spec.ts`       | 9 chars → mensagem do mínimo; senha atual continua a entrar                                                                                          |
| CA-28 | aceitação + unitário   | `auth-reset.spec.ts`; `auth.service.test.ts`                                                                   | E-mail desconhecido → mesma frase; outbox vazia; `send` não chamado, `ping` chamado                                                                  |
| CA-29 | aceitação + unitário   | `auth-reset.spec.ts`; `auth.service.test.ts`                                                                   | Token adulterado → mensagem; unitário: expirado/usado/substituído → `INVALID_RESET_TOKEN`, sessões intactas                                          |
| CA-30 | unitário + componente  | `auth.service.test.ts`; `src/components/auth/ForgotPasswordForm.test.tsx`                                      | `send` lança → `MAIL_UNAVAILABLE` e nenhum token criado; `ping` lança para e-mail inexistente → mesmo erro; UI mostra o texto                        |
| CA-31 | unitário + aceitação   | `schemas.test.ts` (`roleSchema`), `auth.service.test.ts`; `auth-api.spec.ts`                                   | Cargo fora da lista recusado por `createUser`; `POST /api/dev/test-user` com `role: "X"` → 400                                                       |
| CA-32 | aceitação              | `auth-login.spec.ts`                                                                                           | Usuário `OWNER` → cabeçalho `Proprietário`                                                                                                           |
| CA-33 | aceitação              | `auth-api.spec.ts`                                                                                             | `ADMIN` e `MARKETING`: listar lojas 200, trocar senha 200, sair 204                                                                                  |
| CA-34 | unitário + aceitação   | `auth.service.test.ts`; `auth-reset.spec.ts`                                                                   | `+59m59s` aceita, `+1h1s` recusa; segundo uso recusa (parte de CA-25)                                                                                |
| CA-35 | aceitação + unitário   | `auth-reset.spec.ts`; `auth.service.test.ts`                                                                   | Dois pedidos; primeiro link recusado, segundo funciona; `deleteMany` antes de `create`                                                               |
| CA-36 | aceitação              | `auth-reset.spec.ts`                                                                                           | 6 pedidos → 6º 429; outbox com 5; mesmo 429 para e-mail inexistente                                                                                  |
| CA-37 | aceitação              | `auth-password.spec.ts`                                                                                        | Dois contextos; troca em A; B `/api/stores` 200                                                                                                      |
| CA-38 | aceitação + unitário   | `auth-reset.spec.ts`; `auth.service.test.ts`                                                                   | Dois contextos autenticados; redefinição → ambos `/api/stores` 401 e `/` → login com aviso; `session.deleteMany({ userId })` chamado                 |
| CA-39 | unitário               | `auth.service.test.ts`                                                                                         | Login ok → `authAuditLog.create` com `LOGIN_SUCCEEDED`, e-mail normalizado, `userId`, `createdAt` do relógio                                         |
| CA-40 | unitário               | `auth.service.test.ts`; `schemas.test.ts`                                                                      | `LOGIN_FAILED` com `INVALID_CREDENTIALS` (userId null para desconhecido) e `RATE_LIMITED`; esquema inválido não chega ao serviço                     |
| CA-41 | unitário               | `auth.service.test.ts`                                                                                         | `PASSWORD_CHANGED` registrado                                                                                                                        |
| CA-42 | unitário               | `auth.service.test.ts`                                                                                         | `PASSWORD_RESET` registrado                                                                                                                          |
| CA-43 | unitário               | `audit.test.ts`, `auth.service.test.ts`                                                                        | `JSON.stringify` dos argumentos de `create` não contém senha, token nem cookie; `create` que lança não propaga                                       |

Testes adicionais de suporte: `src/server/auth/password.test.ts` (hash/verify, formato, `timingSafeEqual`, senha ≠ hash), `src/server/auth/tokens.test.ts` (43 chars base64url, hash determinístico), `src/server/auth/normalize.test.ts`, `src/server/auth/http.test.ts` (JSON vs formulário, `Origin` divergente → 403, cookie com `Secure` só em produção), `src/server/auth/mail/captured-transport.test.ts`, `src/server/auth/mail/reset-email.test.ts` (link, sem hora absoluta), `src/proxy.test.ts` (matcher via `unstable_doesProxyMatch`, `/api/dev/*` bloqueado em produção), `src/hooks/apiClient.test.ts`, `tests/e2e/auth-nojs.spec.ts` (login e "esqueci" com `javaScriptEnabled: false`, caso extremo).

## 7. Riscos e questões em aberto

**R-1 · Tabelas sem `storeId` (exceção à regra multi-tenant).** `User`, `Session`, `PasswordResetToken` e `AuthAuditLog` descrevem pessoas do painel, não dados de loja; ligá-las a uma loja seria inventar uma regra que a história nega (CA-19: todos veem todas as lojas). Texto exato proposto para `docs/architecture.md`, logo após o parágrafo "Toda tabela futura (...) tem `storeId` obrigatório":

> **Exceção — tabelas de acesso ao painel.** `User`, `Session`, `PasswordResetToken` e `AuthAuditLog` não têm `storeId`: descrevem as pessoas que operam o painel, não dados de uma loja, e toda pessoa autenticada vê todas as lojas (história `login-painel`, CA-19). Nenhuma outra tabela pode usar esta exceção sem a mesma justificativa escrita aqui. Só `src/server/auth/**` lê estas tabelas.

E uma seção nova "Autenticação do painel" com: sessão em banco, cookie `rids_session`, 7 dias, `scrypt`, limites em Redis, auditoria, e-mail via Resend, `npm run auth:create-user`; remover o item "Autenticação do painel" de "Pendências".

**R-2 · Fuso horário.** Nada nesta funcionalidade usa `Store.timezone`: sessões, links e auditoria são instantes absolutos em UTC comparados no servidor; o cookie usa `Expires` absoluto; o e-mail diz "válido por 1 hora" em vez de uma hora do relógio, para não haver conversão. Nenhuma data é mostrada na UI. Mudar o relógio do dispositivo não altera nada (casos extremos cobertos).

**R-3 · Redis fora do ar → falha fechada.** Decisão: login, troca e "esqueci" respondem `503 AUTH_UNAVAILABLE`; ler sessão (`resolveSession`) e sair **não** usam Redis e continuam a funcionar. Motivo: o painel guarda tokens da Shopify; falhar aberto desligaria silenciosamente CA-18/CA-36; o Redis já é dependência dura do sistema (filas) e a falha é visível e reparável. Cuidado técnico obrigatório: `getRedisConnection()` usa `maxRetriesPerRequest: null`, que faz os comandos **esperarem indefinidamente** quando o Redis cai; por isso todo comando é envolvido em `withTimeout(promise, 2_000)` e o timeout conta como indisponibilidade. Alternativa descartada: nova conexão ioredis com `enableOfflineQueue: false` (a decisão 6 manda reutilizar a existente).

**R-4 · Banco fora do ar.** Erros do Prisma → `AUTH_UNAVAILABLE` (CA-13). `ECONNREFUSED` falha rápido; host inalcançável pode demorar (o `pg` não tem `connectionTimeoutMillis` configurado). Mitigação nesta entrega: nenhuma além do erro controlado; a configuração do pool fica para a decisão de hospedagem. `/api/health` não toca no banco (CA-17 mantido).

**R-5 · Hospedagem indefinida — a confirmar quando existir:** (a) TLS terminado antes do Next, com `NODE_ENV=production` no processo (liga `Secure` no cookie e `https` no link do e-mail); (b) o proxy reverso preserva `Host` ou envia `X-Forwarded-Host` igual a `APP_HOST` (verificação de `Origin` em 4.0; se não, ajustar o helper para confiar só em `APP_HOST`); (c) `APP_HOST` é o host público (hoje `localhost:3000` em `.env.example`); (d) registros DNS do domínio de envio no Resend (SPF/DKIM) criados pelo técnico. Não há `serverActions.allowedOrigins` a configurar porque não usamos Server Actions.

**R-6 · Serviço de e-mail: Resend via API REST com `fetch` nativo, sem SDK — zero dependências novas.** Justificativa: o envio é uma única chamada `POST https://api.resend.com/emails` (Bearer `RESEND_API_KEY`, corpo `{ from, to, subject, text }`) e a verificação `GET https://api.resend.com/domains`; o SDK `resend` é um invólucro fino sobre isso e traria mais uma dependência a manter; a resposta é validada com Zod (já existe). Alternativas descartadas: SDK `resend` (dependência sem ganho funcional aqui), SMTP/`nodemailer` (dependência + credenciais SMTP), fila BullMQ (não há worker no repositório e CA-30 exige saber na hora se o envio falhou). Tempo de resposta neutro (CA-28) por **tempo equalizado** (`FORGOT_MIN_RESPONSE_MS = 800`) mais `ping()` nos dois caminhos; a alternativa "enviar fora do pedido" foi descartada pelo mesmo motivo de CA-30. Limitação aceita: se o `ping` passar e só o `send` falhar, o e-mail existente vê 503 e o inexistente vê sucesso (janela mínima, registrada). Variáveis novas em `.env.example` (sem valor): `MAIL_TRANSPORT` (`captured` | `resend`), `RESEND_API_KEY`, `MAIL_FROM` (ex.: `RIDS <rids@sonielparis.fr>`). Custo: plano gratuito do Resend (confirmar no site).

**R-7 · Nova superfície: rotas `/api/dev/outbox` e `/api/dev/test-user`.** São infraestrutura de teste, não de negócio. Motivo: os testes de aceitação precisam de criar usuários e ler e-mails sem banco de produção e sem serviço real. Alternativa descartada: `globalSetup` do Playwright importando o Prisma gerado (`src/generated/prisma`, alias `@/`, ESM) — frágil e obrigaria uma segunda forma de compor o serviço. Mitigações: `404` incondicional quando `NODE_ENV === "production"` (o `next start` define isso), públicas no proxy só fora de produção, sem nenhuma leitura de `passwordHash`, e listadas aqui para o validador conferir. A captura em Redis (não em tabela) evita esquema só de desenvolvimento.

**R-8 · Arquivos fora dos escopos dos construtores.** `src/proxy.ts` (hook alargado pelo orquestrador para o backend), `next.config.ts` (**nenhuma alteração necessária**), `package.json`, `.env.example`, `playwright.config.ts`, `docs/architecture.md` — todos na lista "Orquestrador" da seção 8.

**R-9 · Concorrência.** `INCR` atómico (duas falhas simultâneas contam ambas); "o primeiro navegador ganha" garantido pelo `updateMany` condicional em `usedAt`; dois logins simultâneos criam duas sessões (correto, CA-16); dois "Sair" simultâneos → `deleteMany` sem erro.

**R-10 · Sessões expiradas acumulam.** Sem cron (regra do `CLAUDE.md`): `resolveSession` apaga a linha expirada que encontra; com 3 pessoas e 7 dias o volume é desprezível. Se crescer, uma limpeza por job BullMQ entra numa funcionalidade futura.

**R-11 · Botão "voltar" após sair (CA-5).** Páginas protegidas são dinâmicas (`Cache-Control: no-store` do Next) e o `Sair` usa `location.replace`; o bfcache do navegador pode ainda restaurar uma página; o teste de aceitação usa a variante "digitar o endereço" prevista no CA. Se o dono reportar o caso "voltar" em produção, acrescenta-se um `pageshow` que recarrega.

**R-12 · Sem testes unitários de rota** (importação de `@/server/db` lança sem env). Coberto por aceitação; sugestão para o `CLAUDE.md` no fim da execução: rotas obtêm dependências por uma fábrica que possa ser substituída.

**R-13 · Custo de `scrypt`.** `N=2^15, r=8` ≈ 32 MiB e ~50-100 ms por verificação; com limite de 5 tentativas/15 min por e-mail é aceitável. `maxmem` explícito em 64 MiB (o default de 32 MiB é igual ao consumo e falharia). `max(1024)` nas senhas evita abuso.

**R-14 · Dados legados.** Nenhum: não há usuários. `Store` e `WebhookEvent` não mudam; seed inalterado. A criação da conta do dono é passo manual de instalação (3.8), a documentar em `docs/architecture.md`.

**R-15 · Aceitação exige `docker compose up -d`, `npm run migrate`, `npm run db:seed` e `.env` preenchido** (`ENCRYPTION_KEY` etc. já eram exigidos). `reuseExistingServer` pode reaproveitar um `next dev` sem `MAIL_TRANSPORT=captured`; como `captured` é o default fora de produção, só falha se alguém tiver `MAIL_TRANSPORT=resend` no `.env` local.

**Bloqueios:** nenhum. `CLAUDE.md` não tem placeholders. Novas dependências npm: **nenhuma**.

## 8. Arquivos que serão alterados ou criados

Esta lista é o escopo. (N) novo, (A) alterado.

### Backend (`backend-engineer`)

- (A) `prisma/schema.prisma` — enums `UserRole`, `AuthAuditEvent`; modelos `User`, `Session`, `PasswordResetToken`, `AuthAuditLog`; comentário de exceção a `storeId` no topo.
- (N) `prisma/migrations/<timestamp>_auth_users_sessions_audit/migration.sql` — gerada por `npm run migrate -- --name auth_users_sessions_audit`.
- (N) `src/proxy.ts` — verificação otimista + `config.matcher` (hook alargado pelo orquestrador).
- (N) `src/server/auth/auth.errors.ts` — `class AuthError extends Error { code: AuthErrorCode; status: number }` e `isAuthError`.
- (N) `src/server/auth/schemas.ts` — esquemas Zod de 4.0.
- (N) `src/server/auth/normalize.ts` — `normalizeEmail(email: string): string`.
- (N) `src/server/auth/password.ts` — `hashPassword(password: string): Promise<string>`, `verifyPassword(password: string, stored: string): Promise<boolean>`, `DUMMY_PASSWORD_HASH`.
- (N) `src/server/auth/tokens.ts` — `generateOpaqueToken(): string`, `hashToken(token: string): string`, `isTokenFormat(value: unknown): value is string`.
- (N) `src/server/auth/rate-limit.ts` — `interface RateLimitStore { incr; expire; get; del }`, `createRateLimiter(redis: RateLimitStore, opts: { limit: 5; windowSeconds: 900; timeoutMs: 2000 })` com `isBlocked(key)`, `hit(key)`, `reset(key)`; `withTimeout`.
- (N) `src/server/auth/audit.ts` — `interface AuditRepository`, `createAuditLog(db, now)` com `record(entry: { event; email; userId?: string | null; reason?: "INVALID_CREDENTIALS" | "RATE_LIMITED" }): Promise<void>` que nunca lança.
- (N) `src/server/auth/mail/transport.ts` — `interface MailTransport { send(message: MailMessage): Promise<void>; ping(): Promise<void> }`, `type MailMessage = { to: string; subject: string; text: string }`, `getMailTransport(): MailTransport` (por `MAIL_TRANSPORT`/`NODE_ENV`).
- (N) `src/server/auth/mail/resend-transport.ts` — `createResendTransport(opts: { apiKey: string; from: string; fetchImpl?: typeof fetch })`.
- (N) `src/server/auth/mail/captured-transport.ts` — `createCapturedTransport(redis)` (`LPUSH`/`EXPIRE`) e `readCapturedMessages(redis, to): Promise<CapturedMessage[]>`.
- (N) `src/server/auth/mail/reset-email.ts` — `buildResetEmail(opts: { to: string; resetUrl: string }): MailMessage`, `buildResetUrl(token: string): string`.
- (N) `src/server/auth/auth.service.ts` — `interface AuthRepository` (subconjunto do Prisma: `user`, `session`, `passwordResetToken`, `$transaction`), `createAuthService(deps: { db; rateLimiter; audit; mail: MailTransport; now?: () => Date })` com `login`, `logout`, `resolveSession`, `changePassword`, `requestPasswordReset`, `resetPassword`, `createUser`; `export type AuthService`.
- (N) `src/server/auth/auth.deps.ts` — `getAuthService(): AuthService` (compõe `prisma`, `getRedisConnection()`, `getMailTransport()`; singleton do processo).
- (N) `src/server/auth/http.ts` — `SESSION_COOKIE = "rids_session"`, `readAuthBody(request)`, `respondAuth(request, outcome)`, `setSessionCookie(response, token, expiresAt)`, `clearSessionCookie(response)`, `assertSameOrigin(request)`, `toApiError(error)`.
- (N) `src/server/auth/session-guard.ts` — `getCurrentUser(): Promise<CurrentUser | null>`, `requirePageUser(opts: { next: string }): Promise<CurrentUser>`, `authenticateApiRequest(request: NextRequest): Promise<{ ok: true; user: CurrentUser } | { ok: false; response: NextResponse }>`.
- (N) `src/server/auth/cli/create-user.ts` — script `auth:create-user`.
- (N) `src/app/api/auth/login/route.ts`, (N) `src/app/api/auth/logout/route.ts`, (N) `src/app/api/auth/change-password/route.ts`, (N) `src/app/api/auth/forgot-password/route.ts`, (N) `src/app/api/auth/reset-password/route.ts`.
- (N) `src/app/api/dev/outbox/route.ts`, (N) `src/app/api/dev/test-user/route.ts`.
- (A) `src/app/api/stores/route.ts` — `authenticateApiRequest` antes do serviço.

### Frontend (`frontend-engineer`)

- (N) `src/hooks/apiClient.ts`, (N) `src/hooks/useApiMutation.ts`, (A) `src/hooks/useStores.ts`.
- (N) `src/components/PanelHeader.tsx`.
- (N) `src/components/auth/LoginForm.tsx`, (N) `src/components/auth/ForgotPasswordForm.tsx`, (N) `src/components/auth/ResetPasswordForm.tsx`, (N) `src/components/auth/ChangePasswordForm.tsx`.
- (N) `src/app/login/page.tsx`, (N) `src/app/esqueci-senha/page.tsx`, (N) `src/app/redefinir-senha/page.tsx`, (N) `src/app/conta/senha/page.tsx`.
- (A) `src/app/page.tsx`.

### Compartilhado (criado pelo `backend-engineer`, consumido pelo frontend; ambos declaram em "Desvios")

- (A) `src/shared/types.ts` — tipos da seção 9.
- (N) `src/shared/safe-path.ts` — `toSafeInternalPath(value: string | null | undefined): string`.

### Testes (engenheiros escrevem os unitários/componente dos seus módulos; `test-verifier` escreve a aceitação e complementa)

- Unitários backend: `src/proxy.test.ts`, `src/server/auth/schemas.test.ts`, `normalize.test.ts`, `password.test.ts`, `tokens.test.ts`, `rate-limit.test.ts`, `audit.test.ts`, `http.test.ts`, `auth.service.test.ts`, `mail/captured-transport.test.ts`, `mail/reset-email.test.ts`, `src/shared/safe-path.test.ts`.
- Componente/frontend: `src/hooks/apiClient.test.ts`, `src/components/PanelHeader.test.tsx`, `src/components/auth/LoginForm.test.tsx`, `ForgotPasswordForm.test.tsx`, `ResetPasswordForm.test.tsx`, `ChangePasswordForm.test.tsx`, (A) `src/components/StoreList.test.tsx`.
- Aceitação: (N) `tests/e2e/helpers/auth.ts`, `tests/e2e/auth-login.spec.ts`, `tests/e2e/auth-api.spec.ts`, `tests/e2e/auth-password.spec.ts`, `tests/e2e/auth-reset.spec.ts`, `tests/e2e/auth-nojs.spec.ts`; `tests/e2e/health.spec.ts` inalterado.

### Orquestrador (antes da etapa 4, exatamente assim)

- (A) `.claude/hooks/enforce-scope.sh` — no caso `backend`, acrescentar `src/proxy.ts` aos caminhos permitidos (`src/proxy.test.ts` já é coberto pelo escopo `tests`). **Já feito.**
- (A) `package.json` — só o script `"auth:create-user": "tsx src/server/auth/cli/create-user.ts"`. **Nenhuma dependência nova.**
- (A) `.env.example` — acrescentar, sem valor: `MAIL_TRANSPORT="captured"` (comentário: `captured` em dev/testes, `resend` em produção), `RESEND_API_KEY=""`, `MAIL_FROM=""` (comentário com o formato `RIDS <rids@dominio>` e que o domínio tem de estar verificado no Resend); comentário em `APP_HOST` dizendo que também monta o link de redefinição.
- (A) `playwright.config.ts` — `webServer.env: { MAIL_TRANSPORT: "captured" }`.
- (A) `docs/architecture.md` — textos de R-1 (exceção + seção "Autenticação do painel" + remover a pendência).
- `next.config.ts` — **sem alteração**.

## 9. Divisão de trabalho

**`backend-engineer`** (etapa 4): tudo em "Backend" e "Compartilhado", mais os unitários backend listados. Ordem sugerida: schema + migração + `db:generate` → `types.ts`/`safe-path.ts` → helpers (`password`, `tokens`, `normalize`, `rate-limit`, `audit`, `mail/*`) → `auth.service.ts` (com testes) → `http.ts`, `session-guard.ts`, `auth.deps.ts` → rotas → `proxy.ts` → CLI. Não implementa nada de UI. O "Contrato da API" do resumo dele deve repetir a seção 4 com o que efetivamente foi implementado.

**`frontend-engineer`** (etapa 5): tudo em "Frontend" e os testes de componente. Consome `src/shared/types.ts` e `src/shared/safe-path.ts` sem os alterar (se precisar, "Feedback para o backend"). Importa de `src/server/auth/session-guard.ts` **apenas** `getCurrentUser` e `requirePageUser`, e só em `page.tsx` (Server Components). Não toca em `src/app/api/**`.

**Contrato compartilhado — acréscimos a `src/shared/types.ts`:**

```ts
/** Cargo da pessoa no painel. Espelha o enum Prisma UserRole; não importar o Prisma aqui. */
export type UserRole = "OWNER" | "ADMIN" | "MARKETING";

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "Proprietário",
  ADMIN: "Admin",
  MARKETING: "Marketing",
};

/** Pessoa autenticada, como exposta à UI. Nunca inclui hash, tokens ou sessão. */
export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
}

export type AuthErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_CREDENTIALS"
  | "TOO_MANY_ATTEMPTS"
  | "UNAUTHENTICATED"
  | "INVALID_CURRENT_PASSWORD"
  | "INVALID_RESET_TOKEN"
  | "MAIL_UNAVAILABLE"
  | "AUTH_UNAVAILABLE"
  | "FORBIDDEN_ORIGIN"
  | "NOT_FOUND";

/** Mensagens fixas por código (tabela da seção 4.0), usadas pela API e pelas páginas no caminho sem JavaScript (?erro=). */
export const AUTH_ERROR_MESSAGES: Record<Exclude<AuthErrorCode, "VALIDATION_ERROR">, string>;

/** Motivos de aviso na tela de login (?motivo=). */
export type LoginNotice = "sessao_expirada" | "senha_redefinida";

export interface LoginRequest {
  email: string;
  password: string;
  next?: string;
}
export interface LoginResponse {
  user: CurrentUser;
}
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
export interface ForgotPasswordRequest {
  email: string;
}
export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}
export interface OkResponse {
  ok: true;
}
```

`ApiError` permanece `{ error: { code: string; message: string } }`; para as rotas de auth, `code` é sempre um `AuthErrorCode`. Contrato de 401: **toda** rota protegida devolve `401` com `code: "UNAUTHENTICATED"` e apaga o cookie; o frontend redireciona para `/login?motivo=sessao_expirada&next=...` **somente** com esse código. Cookie: `rids_session`, `HttpOnly; SameSite=Lax; Path=/; Expires=+7d; Secure` em produção. Páginas protegidas: `requirePageUser({ next })` como primeira instrução; rotas protegidas: `authenticateApiRequest(request)` como primeira instrução.

**Aguardando aprovação do briefing (ponto de verificação 2).**
