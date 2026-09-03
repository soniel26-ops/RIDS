#!/bin/bash
# SessionStart: prepara o container do Claude Code na web para rodar
# typecheck, lint e testes. Só age em ambiente remoto; idempotente.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm install --no-audit --no-fund
fi

# Cliente Prisma (não precisa de banco).
npx prisma generate >/dev/null

# Hook pre-commit do git (o npm prepare também faz isto).
git config core.hooksPath .claude/hooks || true

# Sem Redis/Postgres no container: os testes unitários não dependem deles.
echo "session-start: dependências prontas"
