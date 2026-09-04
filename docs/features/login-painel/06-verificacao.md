# Relatório de verificação — Login do painel

**Funcionalidade:** `login-painel` · **História:** `02-historia.md` (v3, CA-1 a CA-43) · **Briefing:** `03-briefing.md` · **Data:** 2026-09-04 · **Agente:** `test-verifier`

Perspectiva externa: páginas dirigidas pelo Chromium (fixture `page`) e API chamada como um cliente HTTP (fixture `request`). Cada teste cria o seu usuário com `uniqueEmail()` via `POST /api/dev/test-user`; e-mails lidos na caixa capturada `GET /api/dev/outbox`; auditoria lida por SQL (`pg`, `DATABASE_URL` do `.env`), só na tabela `AuthAuditLog`, nunca em `User`. Nenhum arquivo fora de `tests/e2e/**` e deste relatório foi tocado; `tests/e2e/health.spec.ts` inalterado e verde.

## 1. Arquivos de teste criados

- `/home/user/RIDS/tests/e2e/helpers/auth.ts` — `uniqueEmail`, `uniquePassword`, `createTestUser`, `loginViaApi(Ok)`, `loginViaPage`/`fillLogin` (espera a resposta do login e a navegação), `waitForHydration`, `alertBox` (exclui o `role="alert"` do anunciador de rota do Next), `readOutbox`, `extractResetPath`, `tokenFromResetPath`, `requestResetLink`, `sessionCookieValue`, `readAuditFor`, `readAuditRawFor`, `auditColumnNames`, `MESSAGES` (textos exatos do contrato).
- `/home/user/RIDS/tests/e2e/auth-login.spec.ts` (21 testes) — CA-1, 2, 3, 5, 6, 7, 8, 9, 11, 14, 16, 18, 21, 23, 32, 33 e casos extremos.
- `/home/user/RIDS/tests/e2e/auth-api.spec.ts` (11) — CA-4, 10, 12, 17, 19, 31, 33 e casos extremos.
- `/home/user/RIDS/tests/e2e/auth-password.spec.ts` (8) — CA-20, 22, 26, 27, 37 e casos extremos.
- `/home/user/RIDS/tests/e2e/auth-reset.spec.ts` (13) — CA-24, 25, 28, 29, 34, 35, 36, 38 e casos extremos.
- `/home/user/RIDS/tests/e2e/auth-audit.spec.ts` (6) — CA-39, 40, 41, 42, 43 e caso extremo.
- `/home/user/RIDS/tests/e2e/auth-nojs.spec.ts` (4) — caso extremo "sem JavaScript" (`test.use({ javaScriptEnabled: false })`).

Total: 63 testes novos + `health.spec.ts` = 64. `npx tsc --noEmit`, `npx eslint tests/e2e` e `prettier --check tests/e2e` verdes.

## 2. Critérios aprovados

| CA    | Teste (arquivo · nome)                                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-1  | auth-login · `CA-1: visitante que abre a página inicial é levado ao login sem ver dados das lojas`                                                               |
| CA-2  | auth-login · `CA-2: login válido leva à página pedida; sem página pedida vai à inicial`                                                                          |
| CA-3  | auth-login · `CA-3: a sessão persiste depois de fechar e reabrir o navegador` (cookie persistente, `Expires` ≥ 6 dias, novo contexto com `storageState`)         |
| CA-4  | auth-api · `CA-4: com sessão válida, /api/stores devolve as lojas normalmente`                                                                                   |
| CA-5  | auth-login · `CA-5: 'Sair' termina a sessão; voltar ao endereço do painel mostra o login` (variante "digitar o endereço", conforme R-11)                         |
| CA-6  | auth-login · `CA-6: quem já tem sessão e abre /login é levado à página inicial`                                                                                  |
| CA-7  | auth-login · `CA-7: senha errada mostra a mensagem genérica e nenhum dado do painel`                                                                             |
| CA-8  | auth-login · `CA-8: e-mail desconhecido mostra exatamente a mesma mensagem genérica de CA-7`                                                                     |
| CA-9  | auth-login · `CA-9: campos vazios ou e-mail inválido indicam o campo em falta sem chamar a API` (+ auth-audit CA-40: 400 da API não gera registro)               |
| CA-10 | auth-api · `CA-10: sem sessão, qualquer dado do painel recebe acesso negado controlado, sem dados` (`/api/stores`, `/api/auth/change-password`, `/api/qualquer`) |
| CA-11 | auth-login · `CA-11: sessão terminada no meio do uso leva ao login com aviso claro, sem erro técnico` (variante página; variante API no componente, ver §4)      |
| CA-12 | auth-api · `CA-12: sessão adulterada ou desconhecida é tratada como não autenticada` (cookie lixo, token bem formado inexistente, página)                        |
| CA-14 | auth-login · `CA-14: não existe forma de criar conta na tela de login` (sem textos de registo; `/api/auth/register` → 401/404)                                   |
| CA-16 | auth-login · `CA-16: dois dispositivos ficam autenticados; 'Sair' num deles só termina esse`                                                                     |
| CA-17 | auth-api · `CA-17: a verificação de saúde continua pública, sem cookie` (+ health.spec `CA-0`)                                                                   |
| CA-18 | auth-login · `CA-18: após 5 falhas, a 6.ª tentativa é recusada mesmo com a senha certa` (bloqueio; parte temporal em §4)                                         |
| CA-19 | auth-api · `CA-19: qualquer cargo vê todas as lojas registradas, sem restrição por loja`                                                                         |
| CA-20 | auth-password · `CA-20: senha com 10 caracteres é aceita, com 9 é recusada, espaços contam, sem outras exigências` (inclui criação pelo técnico e senha igual)   |
| CA-21 | auth-login · `CA-21: a senha digitada nunca reaparece nas respostas nem nas telas` (+ auth-audit CA-43 para o registro; e-mail capturado em CA-24 sem senha)     |
| CA-22 | auth-password · `CA-22: trocar a senha confirma, mantém a sessão e só a nova senha passa a entrar`                                                               |
| CA-23 | auth-login · `CA-23: o painel mostra o e-mail e o cargo junto da ação 'Sair'`                                                                                    |
| CA-24 | auth-reset · `CA-24: pedir o link mostra a frase neutra e o e-mail chega com um link de redefinição`                                                             |
| CA-25 | auth-reset · `CA-25: o link define a nova senha, deixa de funcionar e só a nova senha entra`                                                                     |
| CA-26 | auth-password · `CA-26: senha atual errada não muda nada, mostra a mensagem e mantém a sessão` + `CA-26/CA-18: erros de senha atual somam-se ao limite`          |
| CA-27 | auth-password · `CA-27: nova senha com menos de 10 caracteres é recusada e a atual continua válida` (+ auth-reset `nova senha com 9 caracteres pelo link`)       |
| CA-28 | auth-reset · `CA-28: e-mail desconhecido recebe a mesma frase neutra, em tempo equivalente, sem e-mail` (ambos ≥ 750 ms, diferença < 1,5 s)                      |
| CA-29 | auth-reset · `CA-29: link adulterado é recusado com a mensagem; a senha e as sessões não mudam` (adulterado, truncado, sem token, token gigante)                 |
| CA-31 | auth-api · `CA-31: toda conta tem exatamente um cargo dentre Proprietário, Admin e Marketing`                                                                    |
| CA-32 | auth-login · `CA-32: a conta do dono (OWNER) aparece com o cargo 'Proprietário'`                                                                                 |
| CA-33 | auth-api · `CA-33: Admin e Marketing fazem o mesmo que o Proprietário nesta entrega` + auth-login `CA-33 (caso extremo 'cargo em cada conta')`                   |
| CA-34 | auth-reset · `CA-34: o link só pode ser usado uma vez (o segundo uso é recusado)` (uso único; 1 hora em §4)                                                      |
| CA-35 | auth-reset · `CA-35: só o último link pedido vale`                                                                                                               |
| CA-36 | auth-reset · `CA-36: o 6.º pedido de link em 15 minutos é recusado, para e-mail existente e inexistente` (bloqueio, caixa com 5; libertação em §4)               |
| CA-37 | auth-password · `CA-37: trocar a senha autenticada mantém o outro dispositivo autenticado`                                                                       |
| CA-38 | auth-reset · `CA-38: redefinir pelo link termina as sessões em todos os dispositivos`                                                                            |
| CA-39 | auth-audit · `CA-39: login bem-sucedido fica registrado com e-mail, momento e indicação de sucesso`                                                              |
| CA-40 | auth-audit · `CA-40: logins falhados (senha errada, e-mail desconhecido, limite) ficam registrados; CA-9 não` + `CA-40 (caso extremo 'auditoria em série')`      |
| CA-41 | auth-audit · `CA-41: troca de senha autenticada fica registrada como troca`                                                                                      |
| CA-42 | auth-audit · `CA-42: redefinição pelo link fica registrada como redefinição por 'esqueci a senha'`                                                               |
| CA-43 | auth-audit · `CA-43: o registro nunca guarda senha, link, código de redefinição nem sessão` (linhas completas + colunas da tabela)                               |

Casos extremos da história cobertos e aprovados: e-mail com maiúsculas/espaços (tela e API, login e "esqueci"); senha comparada exatamente (espaços contam); senha com 10 aceita / 9 recusada / igual à atual aceita; entradas muito longas, emojis, caracteres de controle e quebra de linha (mensagem controlada, sistema continua); 4 falhas + sucesso zera a contagem; tentativas simultâneas contam todas; redefinir pelo link zera a contagem; dois pedidos de link (só o último vale); link em dois navegadores (o primeiro ganha); link pedido e senha trocada entretanto; sessão expira durante a troca de senha; "Sair" duas vezes; página pedida inexistente → 404 já autenticada; confirmação diferente da nova senha; POST de outra origem → 403; sem JavaScript: senha errada (`?erro=`), "esqueci a senha" (`?enviado=1`), redefinição pelo link e "Sair" nativos.

## 3. Critérios que falharam

Nenhum critério numerado (CA-1 a CA-43) falhou. Falhou **um caso extremo da história** (seção 3, "Login sem JavaScript ou com conexão lenta: o formulário deve continuar a permitir o envio"):

**Teste:** `tests/e2e/auth-nojs.spec.ts` · `caso extremo (sem JS): login válido entra e mostra o painel` — falhou nas 4 execuções.

```
Error: expect(page).toHaveURL(expected) failed
Expected pattern: /\/$/
Received string:  "http://localhost:3000/login?next=%2F"
  > 29 |   await expect(page).toHaveURL(/\/$/);
```

**Esperado:** o formulário nativo faz `POST /api/auth/login` (form-urlencoded) e o `303` leva a pessoa à página inicial do mesmo host, já autenticada.

**Observado:** o `303` devolve um `Location` **absoluto com o host configurado no servidor Next**, não o host que o navegador usou. Reproduzido com `curl` (servidor `next dev --hostname 127.0.0.1 --port 3000`):

```
$ curl -i -X POST http://127.0.0.1:3000/api/auth/login -H 'Host: 127.0.0.1:3000' \
    -H 'Content-Type: application/x-www-form-urlencoded' -d 'email=x@exemplo.test&password=abcdefghij'
HTTP/1.1 303 See Other
location: http://localhost:3000/login?erro=INVALID_CREDENTIALS

$ curl -i -X POST ... -H 'Host: painel.exemplo.test' ...        → location: http://localhost:3000/login?erro=...
$ curl -i -X POST ... -H 'X-Forwarded-Host: painel.exemplo.test' -H 'X-Forwarded-Proto: https' ...
                                                                → location: https://localhost:3000/login?erro=...
$ curl -i -X POST http://127.0.0.1:3000/api/auth/logout -H 'Content-Type: application/x-www-form-urlencoded' -d ''
HTTP/1.1 303 See Other
location: http://localhost:3000/login
```

O cookie `rids_session` fica gravado para `127.0.0.1`, o navegador é enviado para `localhost:3000/`, o proxy não vê cookie e redireciona para `/login?next=%2F`: sem JavaScript, o login "parece não funcionar" sempre que o host de acesso difere do hostname do servidor. Causa: `respondAuth` (`src/server/auth/http.ts`) faz `NextResponse.redirect(new URL(outcome.formRedirect, request.url), 303)`, e no Next 16 `request.url` é montado em `attachRequestMeta` (`node_modules/next/dist/server/next-server.js`) como `${protocol}://${this.fetchHostname}:${this.port}${req.url}` — a partir do **hostname configurado** do servidor, ignorando `Host`/`X-Forwarded-Host` (só `X-Forwarded-Proto` é respeitado). Vale também para `next start` em produção atrás de um reverse proxy (risco R-5(b) do briefing). O proxy (`src/proxy.ts`) não sofre disto: o seu redirecionamento chega ao cliente como `Location: /login?next=%2F` (relativo).

**Construtor responsável:** `backend-engineer` (`src/server/auth/http.ts`, `respondAuth`). Comportamento esperado: `Location` relativo (`/`, `/login?erro=...`) ou montado a partir de `Host`/`X-Forwarded-Host`, como já faz `assertSameOrigin`. Os demais testes sem JS passam porque só verificam o caminho da URL, não o host; o teste `redefinir pelo link e sair funcionam com formulários nativos` entra pela API de propósito para isolar este defeito no teste de login.

Impacto com JavaScript: nenhum (o formulário usa `fetch` e `window.location.assign(next)` relativo; todos os CA passam).

## 4. Critérios não cobertos adequadamente de fora

| CA / caso                                                | Parte não coberta de fora e motivo                                                                                                                               | Onde está coberta (unitários existentes, verificados por Grep)                                                                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CA-13 (banco fora durante o login)                       | Exigiria derrubar o PostgreSQL/Redis do ambiente; não é provocável de fora sem afetar os outros testes.                                                          | `src/server/auth/auth.service.test.ts:188` (`CA-13: banco fora → AUTH_UNAVAILABLE sem detalhe técnico`); UI: `src/components/auth/LoginForm.test.tsx:122`, `ResetPasswordForm.test.tsx:97` |
| CA-15 (sessão dura 7 dias)                               | Passagem de 7 dias reais. De fora só se provou que o cookie tem `Expires` ≈ +7 dias (CA-3) e que uma sessão apagada é recusada (CA-11/CA-12).                    | `auth.service.test.ts:229` (`CA-15: válida até +7d-1s; em +7d é null e a sessão é apagada`, relógio injetado)                                                                              |
| CA-18 / CA-36 (acesso volta 15 minutos depois)           | Espera real de 15 minutos. O bloqueio em si está coberto (6.ª tentativa/pedido → 429).                                                                           | `auth.service.test.ts:167` (`CA-18: o bloqueio termina 15 minutos depois da primeira falha`), `src/server/auth/rate-limit.test.ts:17` (`createRateLimiter (CA-18, CA-36)`)                 |
| CA-30 (serviço de e-mail indisponível)                   | Com `MAIL_TRANSPORT=captured` o transporte nunca falha; derrubar o Resend real não é possível de fora.                                                           | `auth.service.test.ts:407` e `:420` (`CA-30: ... MAIL_UNAVAILABLE ...`); UI: `src/components/auth/ForgotPasswordForm.test.tsx:70`                                                          |
| CA-34 (link vale 1 hora; 59m59s aceita, 1h01s recusa)    | Passagem de 1 hora real. Uso único e recusa do link inválido estão cobertos (CA-25, CA-29, CA-34).                                                               | `auth.service.test.ts:490` (`CA-34: aceita a 59m59s e recusa a 1h01s`) e `:511`                                                                                                            |
| Caso "fronteira de expiração / fuso do dispositivo"      | Mesmo motivo (tempo real); alterar o relógio do Chromium não altera o servidor, que é quem decide.                                                               | `auth.service.test.ts:229`, `:490`                                                                                                                                                         |
| Caso "duplicidade de conta" (segunda conta recusada)     | A única forma de criar conta é o CLI interativo (`npm run auth:create-user`, senha sem eco no terminal); `/api/dev/test-user` repõe a conta em vez de duplicar.  | `auth.service.test.ts:599` (`recusa e-mail duplicado, mesmo com outra grafia`)                                                                                                             |
| Caso "sem permitir dois envios da mesma tentativa"       | Só observável com a resposta retida; interceptar a rede seria um mock. Verificou-se de fora apenas que o botão passa a `A entrar…` desabilitado (HTML em CA-21). | `src/components/auth/LoginForm.test.tsx:73` (`mostra 'A entrar…' com o botão desabilitado enquanto aguarda (sem duplo envio)`) e testes de `useApiMutation`                                |
| CA-11 variante "sessão expira enquanto a lista carrega"  | Exigiria matar a sessão entre o HTML e o `fetch` de `/api/stores` (janela de milissegundos) ou reter a resposta (mock). Variante "página" coberta em `CA-11`.    | `src/components/StoreList.test.tsx` (`CA-11: 401 UNAUTHENTICATED redireciona para o login sem mostrar erro`)                                                                               |
| Caso "auditoria quando o registro falha"                 | Exigiria fazer a gravação falhar no banco real.                                                                                                                  | `src/server/auth/audit.test.ts:15` (`audit (CA-39 a CA-43)`, `record` nunca lança)                                                                                                         |
| CA-14 (conta inicial criada pelo técnico, senha sem eco) | Fluxo do CLI é interativo; verificado de fora só que a tela e a API não oferecem registo.                                                                        | `auth.service.test.ts` (`createUser`), `src/server/auth/schemas.test.ts`                                                                                                                   |

Nota sobre um caso extremo cuja implementação aprovada difere da história: a história diz que entradas com "milhares de caracteres" são recusadas "com a mesma mensagem genérica"; o briefing aprovado (seção 4.0) define `max(254)` no e-mail e `max(1024)` na senha com `400 VALIDATION_ERROR` (`E-mail inválido.`, `Senha demasiado longa.`). O teste aceita as mensagens controladas do contrato e verifica que não há detalhe técnico; fica registrado para o validador.

## 5. Mocks usados

Nenhum mock interno. Fronteiras externas ao sistema:

- **E-mail (fornecedor Resend):** substituído pelo transporte `captured` do próprio produto (`MAIL_TRANSPORT=captured` no `.env` e no `webServer.env`), lido por `GET /api/dev/outbox?to=`. É a forma de captura prevista no briefing (3.9/4.7); o envio real não é exercido (CA-30 em §4).
- **Criação de contas:** `POST /api/dev/test-user` (rota só de desenvolvimento do produto) em vez do CLI interativo. Também é usada para terminar sessões no servidor (CA-11, caso "sessão expira durante a troca") — repõe a mesma senha, logo o único efeito é apagar sessões/tokens e zerar contadores.
- **Auditoria:** leitura SQL direta de `AuthAuditLog` (e `information_schema.columns`) com `pg` e a `DATABASE_URL` do `.env` — consulta externa prevista no critério ("o responsável técnico consulta o registro"). Só leitura; nunca toca em `User`.
- **Ambiente (fora do repositório):** o Playwright 1.62.1 procura o build `chromium_headless_shell-1234`, mas `/opt/pw-browsers` só tem o build `1194` (Chromium 141). Sem rodar `playwright install`, criei atalhos simbólicos em `/opt/pw-browsers` (`chromium_headless_shell-1234 → -1194`, `chromium-1234 → -1194`, `chrome-headless-shell-linux64 → chrome-linux`, `chrome-headless-shell → headless_shell`). Nenhum arquivo do projeto foi alterado para isso.

## 6. Comando executado e resultado final

Comando do `CLAUDE.md`: `npm run test:e2e` (Playwright, `fullyParallel`, 2 workers em 4 CPUs, `reuseExistingServer` com `next dev --hostname 127.0.0.1 --port 3000` já no ar; banco `prisma dev` em `localhost:51214`, Redis em `6379`).

```
$ npm run test:e2e
Running 64 tests using 2 workers
  ...
  ✘  39 tests/e2e/auth-nojs.spec.ts:19:5 › caso extremo (sem JS): login válido entra e mostra o painel (5.6s)
  1 failed
    tests/e2e/auth-nojs.spec.ts:19:5 › caso extremo (sem JS): login válido entra e mostra o painel
  63 passed (47.5s)
```

Complementos: `npm run test:e2e -- --workers=1` → 62 passed / 2 failed (o mesmo sem-JS + um 503 do ambiente, ver abaixo); `npm test` → 22 arquivos, 192 testes verdes (inalterados; confirma os unitários referenciados em §4); `npx tsc --noEmit`, `npx eslint tests/e2e`, `prettier --check tests/e2e` sem erros.

**Instabilidade do ambiente, não do produto (registrada para o orquestrador/validador).** Nas execuções intermédias, 3 a 4 testes distintos falharam por `503 AUTH_UNAVAILABLE` em pontos aleatórios (`change-password`, `test-user`, `forgot-password`, `requirePageUser`). O log do servidor mostra sempre o mesmo erro do banco:

```
Database error. Code: `08P01`. Message: `bind message supplies 3 parameters, but prepared statement "" requires 0`
```

É um erro de protocolo do daemon `prisma dev` (PGlite, processo `@prisma/dev/dist/daemon.cjs` na porta 51214) quando duas conexões do pool `pg` intercalam `Parse`/`Bind` do prepared statement sem nome — um PostgreSQL real tem um backend por conexão e não mistura esse estado. A aplicação tratou o erro corretamente (503 com mensagem controlada, sem detalhe técnico ao cliente). Só o teste CA-36 foi ajustado para pedir os links em série (o critério é "5 pedidos em 15 minutos", não simultaneidade); a concorrência real continua exercida em `CA-18 (caso extremo): tentativas erradas simultâneas contam todas`. Na execução final não houve nenhuma ocorrência de `08P01`. Recomendação: em CI, usar o PostgreSQL do `docker compose` (R-15 do briefing) e não o daemon `prisma dev`.

**Não alterado nem sugerido alterar:** `playwright.config.ts`, `.env`, código de produção. Nenhum teste foi pulado ou marcado como `skip`.

## Observações para o orquestrador

1. Defeito a devolver ao `backend-engineer` (§3): `Location` absoluto nos `303` de `respondAuth`; sugestão de regra para o `CLAUDE.md`: "Redirecionamentos de rotas de API usam `Location` relativo; `request.url` no Next reflete o hostname configurado do servidor, não o `Host` do pedido".
2. Ambiente: navegador do Playwright desatualizado em `/opt/pw-browsers` (build 1194 para um Playwright que espera 1234) e daemon `prisma dev` incompatível com conexões concorrentes — ambos afetam quem correr `npm run test:e2e` nesta máquina.
3. Sugestão para o `frontend-engineer`/regras: o Next injeta `<div role="alert" id="__next-route-announcer__">` em toda página; testes de aceitação e de componente que usem `getByRole("alert")` precisam de o excluir (helper `alertBox` em `tests/e2e/helpers/auth.ts`).
