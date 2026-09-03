# RIDS

Painel interno para gerir várias lojas de dropshipping na Shopify.
Lojas atuais: sonielsupply.com e sonielparis.fr.

## Como rodar

Pré-requisitos: Node.js 22, PostgreSQL e Redis acessíveis.

```bash
cp .env.example .env        # preencha DATABASE_URL, REDIS_URL, ENCRYPTION_KEY
npm install                 # também ativa o hook pre-commit contra segredos
npm run db:generate
npm run migrate             # cria as tabelas
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
