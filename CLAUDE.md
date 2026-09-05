# CLAUDE.md

Livro de regras do RIDS. Toda sessão do Claude Code começa sem contexto: leia este
arquivo primeiro. Mantenha-o entre 100 e 300 linhas.

## O que é o RIDS

Sistema interno que gere várias lojas de dropshipping na Shopify a partir de um
único painel. Cada loja é um **tenant**: tem o seu token da Admin API, os seus
produtos, pedidos e fornecedores. Hoje são duas lojas, registradas em
`prisma/seed.ts` apenas pelo domínio: **sonielsupply.com** e **sonielparis.fr**.
A conexão de cada loja (OAuth e token) ainda não foi feita.

## Stack

- Linguagem/runtime: TypeScript sobre Node.js 22
- Framework web: Next.js 16 (App Router) com React 19 e Tailwind 4
- Banco de dados e ORM: PostgreSQL com Prisma 7 (adaptador `@prisma/adapter-pg`)
- Filas e jobs: BullMQ sobre Redis (`ioredis`)
- Integração: `@shopify/shopify-api` v14, Admin API GraphQL, versão `July26`
- Validação: Zod
- Testes: Vitest (unitários e de componente, jsdom) e Playwright (aceitação)
- Lint e formatação: ESLint 9 (config do Next) e Prettier

Atenção: o Next 16 tem mudanças em relação ao que a IA costuma conhecer. Antes de
escrever código do Next, leia o guia em `node_modules/next/dist/docs/` (ver
`AGENTS.md`). O Prisma 7 usa `prisma.config.ts` e o gerador `prisma-client` com
saída em `src/generated/prisma` (ignorado pelo git; rode `npm run db:generate`).

## Comandos

- dev: `npm run dev`
- build: `npm run build`
- test: `npm test` (Vitest, só `src/**/*.test.{ts,tsx}`)
- test (aceitação): `npm run test:e2e` (Playwright, `tests/e2e/**`, sobe o servidor sozinho)
- typecheck: `npm run typecheck`
- lint: `npm run lint` (corrigir: `npm run lint:fix`)
- format: `npm run format` (verificar: `npm run format:check`)
- gerar cliente Prisma: `npm run db:generate`
- migrate: `npm run migrate` (migrações em `prisma/migrations`, geradas pelo Prisma, nunca à mão)
- infra local: `docker compose up -d` (PostgreSQL e Redis, ver `docker-compose.yml`)
- seed: `npm run db:seed`

Ordem obrigatória antes de qualquer engenheiro terminar: typecheck, lint, test.

## Layout de pastas

Os agentes construtores só podem tocar a metade que lhes pertence. O hook
`.claude/hooks/enforce-scope.sh` bloqueia edições fora dela.

- **Backend:** `src/server/**` (serviços, jobs, segurança, cliente Shopify), `src/proxy.ts`,
  `src/app/api/**` (rotas de API), `prisma/**`
- **Frontend:** `src/app/**` exceto `src/app/api/**` (páginas e layouts),
  `src/components/**`, `src/hooks/**`
- **Compartilhado:** `src/shared/**` (contratos de tipos entre API e UI).
  Qualquer alteração aqui tem de aparecer na seção "Desvios" do resumo do engenheiro.
- **Testes:** `**/*.test.ts(x)` ao lado do código (unitários e de componente),
  `tests/e2e/**` (aceitação, Playwright). O `test-verifier` só toca estes.
- **Gerado:** `src/generated/**`, nunca editado à mão.
- **Documentação:** `docs/`, `docs/features/<funcionalidade>/` para os artefatos da fábrica.

## Regras de arquitetura

- Rotas de API são finas: validar entrada com Zod, chamar o serviço, devolver a
  resposta. A lógica de negócios vive em `src/server/<domínio>/<nome>.service.ts`.
- Serviços recebem as dependências por parâmetro (ver `createStoreService`) para
  serem testáveis sem banco.
- **Toda loja é um tenant.** Nenhuma consulta, job ou chamada à Shopify acontece
  sem `storeId`. Não existe consulta "todas as lojas" fora do serviço de lojas.
- **Tokens da Shopify são segredos.** Ficam na coluna `accessTokenEncrypted`,
  cifrados com `src/server/security/crypto.ts`. Só o cliente Shopify os decifra, em
  memória. Nunca aparecem em logs, respostas de API, testes ou fixtures.
- **Webhooks chegam repetidos.** Todo webhook é gravado em `WebhookEvent` pelo
  `X-Shopify-Webhook-Id` (único) antes de qualquer efeito, e o processamento é
  idempotente. Assinatura HMAC verificada sempre.
- **A Shopify limita chamadas por loja.** Operações em massa (sincronizar
  catálogo, atualizar preços, enviar pedidos) vão para as filas de
  `src/server/jobs/queue.ts`, com `jobId` determinístico e retry exponencial.
  Nunca em loop direto numa rota.
- Datas são guardadas em UTC. A conversão usa `Store.timezone` só na borda
  (tela ou e-mail).
- Erros internos não chegam brutos ao cliente. A API devolve `ApiError`
  (`src/shared/types.ts`) com código e mensagem controlada; o detalhe vai para o log,
  sem dados sensíveis.
- Reutilize helpers existentes antes de criar um novo. Se criar, explique por quê.
- Componentes de UI tratam sempre quatro estados: carregando, vazio, erro e sucesso
  (ver `StoreList`). Chamadas à API passam por hooks em `src/hooks/`.

## Não faça

- Não adicione tarefas cron no sistema operacional. Use BullMQ.
- Não registre payloads brutos de webhooks, tokens, senhas ou dados de clientes em logs.
- Não faça commits diretamente no branch `main`.
- Não adicione dependências sem que o briefing técnico as tenha listado.
- Não altere arquivos fora do escopo acordado no briefing.
- Não pule, desabilite ou marque como "skip" um teste para ficar verde.
- Não invente regras de negócio (prazos, margens, fornecedor por produto). Se não
  está na história ou no briefing aprovado, pare e pergunte.
- Não edite `src/generated/**` nem `package-lock.json` à mão.
- Não faça commit de `.env*`, `*.key`, `*.pem` ou `secrets.json`
  (o hook `.claude/hooks/block-secrets.sh` bloqueia, mas a regra vale antes dele).
- Não cole tokens ou credenciais no chat. Eles entram por `.env` ou pelo fluxo de
  conexão da loja.

## Fábrica de agentes (feature-factory)

Funcionalidades são construídas pela skill `feature-factory`, que encadeia
7 agentes em `.claude/agents/`:

| Ordem | Agente              | Papel                                        | Acesso                    |
| ----- | ------------------- | -------------------------------------------- | ------------------------- |
| 1     | `researcher`        | mapeia o código relevante                    | somente leitura           |
| 2     | `story-writer`      | história de usuário + critérios de aceitação | somente leitura           |
| 3     | `project-manager`   | briefing técnico                             | somente leitura           |
| 4     | `backend-engineer`  | implementa o backend                         | pastas de backend         |
| 5     | `frontend-engineer` | implementa a UI contra o contrato do backend | pastas de frontend        |
| 6     | `test-verifier`     | testes de aceitação por critério             | somente arquivos de teste |
| 7     | `validator`         | reporta lacunas por gravidade                | somente leitura           |

Três pontos de verificação humanos: aprovar a história, aprovar o briefing,
revisar o resultado final antes de qualquer PR.

Regra contra a deriva: um erro pequeno é corrigido na hora. Uma suposição
arquitetônica errada significa descartar a sessão e recomeçar com a suposição
correta já incorporada. Não remende modelos mentais errados.

## Regras aprendidas (funcionalidade login-painel, 2026-09-04)

- Rotas de API obtêm o serviço por uma fábrica substituível (`getXService()` em
  `x.deps.ts`), nunca importando `@/server/db` diretamente. Assim as rotas ficam
  testáveis em Vitest.
- Dublês de teste que não são `*.test.*` vivem em `src/<camada>/testing/`.
- Constantes usadas pela API e pela UI (regex, limites, textos de aviso) vivem em
  `src/shared/`, nunca duplicadas em backend e frontend.
- `src/proxy.ts` só importa `next/server` e `src/shared/**`. Redireciona com
  `NextResponse.redirect(new URL(caminho, request.url))`: o Next relativiza o
  `Location` sozinho; um `Location` relativo no proxy dá erro 500.
- Em rotas de API é o contrário: `3xx` com `Location` relativo (caminho interno).
  Nunca construa a URL a partir de `request.url`: no Next 16 ela carrega o hostname
  configurado do servidor, não o `Host` do pedido.
- Toda correção a redirecionamento ou cookie é confirmada com `curl -i` contra o
  `next dev` antes de fechar; o Vitest não passa pelo adapter do Next.
- Sem banco na sessão, a migração é gerada com
  `prisma migrate diff --from-schema <anterior> --to-schema prisma/schema.prisma --script`
  e o resumo diz que ainda não foi aplicada.
- Páginas leem `await props.searchParams` e passam props a componentes cliente;
  formulários não usam `useSearchParams`/`useRouter`, para serem testáveis em jsdom.
- Links entre páginas usam `<Link>`; só navegações que exigem recarga completa
  (login, logout, redefinição) usam `window.location`, com `eslint-disable` justificado.
- O lint do React Compiler está ativo: sem `setState` síncrono em efeitos; a
  hidratação detecta-se com `useSyncExternalStore`.
- Em testes de componente, `window.location` substitui-se com `vi.stubGlobal("location", …)`;
  `vi.mock` parcial não intercepta chamadas internas ao próprio módulo. Com `vi.mock`,
  crie o spy como `vi.fn(implReal)`: `vi.restoreAllMocks()` apaga implementações
  definidas depois.
- Testes que usam `getByRole("alert")` excluem `#__next-route-announcer__`.
- Títulos de página não repetem exatamente o texto de um botão ou link da mesma tela.
- Testes de aceitação em CI correm contra o PostgreSQL do `docker compose`; o
  `prisma dev` (PGlite) falha com conexões concorrentes (`08P01`).

## Hábito de manutenção

Sempre que a IA cometer um erro que o surpreenda, pergunte: uma regra neste
arquivo teria evitado? Se sim, adicione a regra aqui. Os agentes construtores
sugerem regras no fim de cada execução (seção "regras que teriam ajudado").

## Documentação mais detalhada

- `docs/architecture.md` — modelo de dados, fluxo de conexão de loja, webhooks, filas, pendências
- `.claude/skills/feature-factory/SKILL.md` — a cadeia completa e as transferências
- `AGENTS.md` — aviso do Next 16 sobre ler a documentação local
