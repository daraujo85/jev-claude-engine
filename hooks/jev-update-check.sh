#!/usr/bin/env bash
# jev-update-check — avisa no terminal quando o JEV engine tem atualização no GitHub.
# Roda como SessionStart hook (Claude Code / Codex / OpenCode). Fail-open: sem rede
# ou sem git, sai mudo.
set -uo pipefail

PROJ="${JEV_PROJECT_DIR:-$HOME/Documents/projects/jev-claude-engine}"
[ -d "$PROJ/.git" ] || exit 0

# fetch silencioso e curto; falhou = sem rede, sai mudo
timeout 8 git -C "$PROJ" fetch origin --quiet 2>/dev/null || exit 0

CUR=$(git -C "$PROJ" rev-parse HEAD 2>/dev/null) || exit 0
LATEST=$(git -C "$PROJ" rev-parse origin/main 2>/dev/null) || exit 0
[ -n "$CUR" ] && [ -n "$LATEST" ] || exit 0
[ "$CUR" = "$LATEST" ] && exit 0

CUR_SHORT=${CUR:0:8}
LATEST_SHORT=${LATEST:0:8}

cat <<EOF

  ⚡ JEV ENGINE — ATUALIZAÇÃO DISPONÍVEL
  ─────────────────────────────────────────
    atual:   ${CUR_SHORT}
    remoto:  ${LATEST_SHORT}
    atualize: cd $PROJ && git pull && node scripts/install-hooks.js
  ─────────────────────────────────────────
EOF