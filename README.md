# RIDS

Painel interno para gerir várias lojas de dropshipping na Shopify.
Lojas atuais: sonielsupply.com e sonielparis.fr.

## Como rodar

Pré-requisitos: Node.js 22 e Docker (para PostgreSQL e Redis locais).

```bash
docker compose up -d        # PostgreSQL em :5432 e Redis em :6379
cp .env.example .env        # gere ENCRYPTION_KEY (instrução dentro do arquivo)
npm install                 # também ativa o hook pre-commit contra segredos
npm run db:generate
npm run migrate             # aplica prisma/migrations (já contém a migração inicial)
npm run db:seed             # registra as duas lojas (sem credenciais)
npm run dev                 # http://localhost:3000
```

## Qualidade

```bash
npm run typecheck
npm run lint
npm test                    # unitários e de componente (Vitest)
npm run test:e2e            # aceitação (Playwright, sobe o servidor sozinho)
```

## Como o código é construído

Funcionalidades entram pela skill `feature-factory` do Claude Code, que encadeia
sete agentes especializados com três aprovações humanas. As regras do projeto
estão em `CLAUDE.md`; a arquitetura em `docs/architecture.md`.
