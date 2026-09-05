#!/usr/bin/env bash
# Bloqueia commits que contenham arquivos de segredo.
#
# Funciona de duas formas:
#   1. Como hook PreToolUse do Claude Code (registrado em .claude/settings.json):
#      recebe o JSON da chamada no stdin; se o comando Bash contiver "git commit",
#      inspeciona os arquivos staged e sai com código 2 para bloquear.
#   2. Como hook pre-commit do git (via .claude/hooks/pre-commit, com
#      `git config core.hooksPath .claude/hooks`): sem stdin JSON, inspeciona os
#      arquivos staged e sai com código 1 para bloquear.
#
# Padrões bloqueados: .env e variantes (.env.local, .env.production...),
# *.key, *.pem e secrets.json, em qualquer pasta. .env.example é permitido.

set -u

is_secret_path() {
  local path="$1"
  local base
  base="$(basename -- "$path")"
  case "$base" in
    .env.example|.env.sample|.env.template) return 1 ;;
    .env|.env.*) return 0 ;;
    *.key|*.pem|secrets.json) return 0 ;;
  esac
  return 1
}

check_staged() {
  local blocked=()
  local f
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if is_secret_path "$f"; then
      blocked+=("$f")
    fi
  done < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null)

  if [ "${#blocked[@]}" -gt 0 ]; then
    {
      echo "COMMIT BLOQUEADO: arquivos de segredo no stage."
      echo ""
      echo "Arquivos bloqueados:"
      for f in "${blocked[@]}"; do echo "  - $f"; done
      echo ""
      echo "Por quê: .env*, *.key, *.pem e secrets.json contêm credenciais."
      echo "Uma vez no Git, mesmo depois de removidos, ficam no histórico e no remoto."
      echo ""
      echo "Como resolver:"
      echo "  git restore --staged <arquivo>      # tira do stage"
      echo "  echo '<arquivo>' >> .gitignore      # evita que volte"
      echo "  Se precisa versionar um modelo, use .env.example sem valores reais."
    } >&2
    return 1
  fi
  return 0
}

MODE="${1:-}"

if [ "$MODE" = "--git-hook" ]; then
  # Modo git pre-commit: bloqueia com exit 1.
  check_staged || exit 1
  exit 0
fi

# Modo Claude Code PreToolUse: lê o JSON do stdin.
INPUT="$(cat 2>/dev/null || true)"
[ -z "$INPUT" ] && exit 0

if command -v jq >/dev/null 2>&1; then
  CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)"
else
  # Fallback sem jq: extrai o campo "command" de forma aproximada.
  CMD="$(printf '%s' "$INPUT" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p' | head -n1)"
fi

# Só age em comandos que fazem commit.
if printf '%s' "$CMD" | grep -Eq '(^|[^[:alnum:]_-])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+commit([[:space:]]|$)'; then
  # Se o comando também adiciona arquivos (git add / commit -a / -A), verifica
  # o que ele adicionaria além do que já está no stage.
  if printf '%s' "$CMD" | grep -Eq 'git[[:space:]]+add|commit[[:space:]]+.*(-a|-A|--all)([[:space:]]|$)'; then
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      if is_secret_path "$f"; then
        {
          echo "COMMIT BLOQUEADO: o comando adicionaria um arquivo de segredo ao stage."
          echo "Arquivo: $f"
          echo "Por quê: .env*, *.key, *.pem e secrets.json contêm credenciais e não podem ir para o Git."
          echo "Adicione-o ao .gitignore e faça o commit sem ele."
        } >&2
        exit 2
      fi
    done < <(git status --porcelain --untracked-files=all 2>/dev/null | awk '{print $NF}')
  fi
  check_staged || exit 2
fi

exit 0
