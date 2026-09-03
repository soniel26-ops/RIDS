# CLAUDE.md

Arquivo de memória do projeto RIDS. Toda sessão do Claude Code começa sem contexto:
este arquivo é o livro de regras que ela lê primeiro. Mantenha-o entre 100 e 300 linhas.
Tudo entre colchetes `[...]` é um placeholder que ainda precisa ser preenchido com a
stack real do projeto. Enquanto um placeholder existir, os agentes devem PERGUNTAR
em vez de supor.

## O que é o RIDS
[Descreva em 2 ou 3 linhas o que o sistema faz, quem usa e qual problema resolve.]

## Stack
- Linguagem/runtime: [Node.js 22 / Python 3.x / ...]
- Framework web: [Next.js App Router / Express / FastAPI / ...]
- Banco de dados e ORM: [PostgreSQL + Prisma / ...]
- Filas e jobs em segundo plano: [BullMQ / ...]
- E-mail e notificações: [Resend / ...]
- Testes: [Vitest / Jest / Pytest / Playwright ...]
- Lint e formatação: [ESLint + Prettier / Ruff ...]

## Comandos
- dev: `[npm run dev]`
- test: `[npm test]`
- test (aceitação/e2e): `[npm run test:e2e]`
- typecheck: `[npx tsc --noEmit]`
- lint: `[npm run lint]`
- migrate: `[npx prisma migrate dev]`

## Layout de pastas
Os agentes construtores só podem tocar a metade que lhes pertence.
- Backend: `[src/server/**, src/services/**, src/jobs/**, prisma/**]`
- Frontend: `[src/app/**, src/components/**, src/hooks/**]`
- Compartilhado (tipos, contratos): `[src/shared/**]` — alteração exige aviso no resumo.
- Testes: `[tests/**, **/*.test.*, **/*.spec.*]`
- Documentação: `docs/`

## Regras de arquitetura
- A lógica de negócios reside nos serviços. As rotas da API devem ser finas:
  validar entrada, chamar o serviço, devolver a resposta.
- Toda consulta ao banco filtra pelo tenant/empresa atual. Não existe consulta
  "global" sem justificativa explícita no briefing.
- Datas são armazenadas em UTC. A conversão para o fuso do usuário acontece
  apenas na borda (apresentação ou envio de e-mail), usando o fuso do tenant.
- Tarefas repetíveis vivem em jobs idempotentes: rodar duas vezes não pode
  gerar dois efeitos.
- Erros internos nunca chegam brutos ao cliente. A API devolve mensagens
  controladas; o detalhe vai para o log.
- Reutilize helpers existentes antes de criar um novo. Se criar, explique por quê.
- [Suas convenções de nomes de arquivos, pastas e exports.]

## Não faça
- Não adicione tarefas cron no sistema operacional. Use `[BullMQ]`.
- Não registre payloads brutos de pagamento, tokens, senhas ou dados pessoais em logs.
- Não faça commits diretamente no branch `main`.
- Não adicione dependências sem que o briefing técnico as tenha listado.
- Não altere arquivos fora do escopo acordado no briefing.
- Não pule, desabilite ou marque como "skip" um teste para ficar verde.
- Não invente regras de negócio. Se a regra não está na história ou no
  briefing aprovado, pare e pergunte.
- Não faça commit de `.env*`, `*.key`, `*.pem` ou `secrets.json`
  (o hook em `.claude/hooks/` bloqueia isso, mas a regra vale antes do hook).

## Fábrica de agentes (feature-factory)
Funcionalidades são construídas pela skill `feature-factory`, que encadeia
7 agentes em `.claude/agents/`:

| Ordem | Agente | Papel | Acesso |
|-------|--------|-------|--------|
| 1 | `researcher` | mapeia o código relevante | somente leitura |
| 2 | `story-writer` | história de usuário + critérios de aceitação | somente leitura |
| 3 | `project-manager` | briefing técnico | somente leitura |
| 4 | `backend-engineer` | implementa o backend | pastas de backend |
| 5 | `frontend-engineer` | implementa a UI contra o contrato do backend | pastas de frontend |
| 6 | `test-verifier` | testes de aceitação por critério | somente arquivos de teste |
| 7 | `validator` | reporta lacunas por gravidade | somente leitura |

Três pontos de verificação humanos: aprovar a história, aprovar o briefing,
revisar o resultado final antes de qualquer PR.

Regra contra a deriva: um erro pequeno é corrigido na hora. Uma suposição
arquitetônica errada significa descartar a sessão e recomeçar com a suposição
correta já incorporada. Não remende modelos mentais errados.

## Hábito de manutenção
Sempre que a IA cometer um erro que o surpreenda, pergunte: uma regra neste
arquivo teria evitado? Se sim, adicione a regra aqui. Os agentes construtores
também sugerem regras no fim de cada execução (seção "regras que teriam ajudado").

## Documentação mais detalhada
- `docs/architecture.md` — [a criar]
- `docs/billing.md` — [a criar]
- `.claude/skills/feature-factory/SKILL.md` — a cadeia completa e as transferências
