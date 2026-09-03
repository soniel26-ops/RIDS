#!/usr/bin/env bash
# Hook PreToolUse (Edit|Write) que limita um agente construtor às suas pastas.
# Uso (no frontmatter do agente): enforce-scope.sh <backend|frontend|tests>
# Lê o JSON da chamada no stdin, extrai tool_input.file_path e sai com 2 (bloqueia)
# se o caminho estiver fora do escopo. Espelha o "Layout de pastas" do CLAUDE.md.

set -u
SCOPE="${1:-}"
INPUT="$(cat 2>/dev/null || true)"
[ -z "$INPUT" ] && exit 0

if command -v jq >/dev/null 2>&1; then
  FILE="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null)"
else
  FILE="$(printf '%s' "$INPUT" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
fi
[ -z "$FILE" ] && exit 0

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
REL="${FILE#"$ROOT"/}"
REL="${REL#./}"

is_test_file() {
  case "$1" in
    tests/*|*.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx) return 0 ;;
  esac
  return 1
}

allowed=1
case "$SCOPE" in
  backend)
    case "$REL" in
      src/server/*|src/app/api/*|prisma/*|src/shared/*) allowed=0 ;;
      docs/features/*) allowed=0 ;;
    esac
    ;;
  frontend)
    case "$REL" in
      src/app/api/*) allowed=1 ;;
      src/app/*|src/components/*|src/hooks/*|src/shared/*) allowed=0 ;;
      docs/features/*) allowed=0 ;;
    esac
    ;;
  tests)
    if is_test_file "$REL"; then allowed=0; fi
    case "$REL" in docs/features/*) allowed=0 ;; esac
    ;;
  *)
    echo "enforce-scope.sh: escopo desconhecido '$SCOPE'" >&2
    exit 0
    ;;
esac

# Gerado nunca é editado à mão, por ninguém.
case "$REL" in src/generated/*|package-lock.json) allowed=1 ;; esac

if [ "$allowed" -ne 0 ]; then
  {
    echo "EDIÇÃO BLOQUEADA: '$REL' está fora do escopo '$SCOPE'."
    echo "Escopos (CLAUDE.md, Layout de pastas):"
    echo "  backend  → src/server/**, src/app/api/**, prisma/**, src/shared/**"
    echo "  frontend → src/app/** (exceto api), src/components/**, src/hooks/**, src/shared/**"
    echo "  tests    → tests/**, **/*.test.*, **/*.spec.*"
    echo "Se a funcionalidade exige esta alteração, reporte no seu resumo em vez de fazê-la."
  } >&2
  exit 2
fi
exit 0
