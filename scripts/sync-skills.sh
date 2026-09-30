#!/usr/bin/env bash
# Sync JEV skills + OpenCode plugin into every agent's directory.
# Idempotent: re-running re-points symlinks, never duplicates.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="$PROJECT_DIR/skills"
PLUGIN_SRC="$PROJECT_DIR/plugins/jev-opencode.js"

JEV_SKILLS=(
  jev-anti-regression
  jev-browser-test
  jev-discover
  jev-explore
  jev-plan-evaluator
  jev-review
)

TARGETS=(
  "$HOME/.claude/skills"
  "$HOME/.opencode/skills"
  "$HOME/.codex/skills"
  "$HOME/.gemini/skills"
  "$HOME/.agents/skills"
)

installed=0
for target in "${TARGETS[@]}"; do
  [ -d "$target" ] || { mkdir -p "$target"; }
  for s in "${JEV_SKILLS[@]}"; do
    [ -d "$SKILLS_DIR/$s" ] || { echo "!! skill ausente: $s" >&2; continue; }
    ln -sfn "$SKILLS_DIR/$s" "$target/$s"
    installed=$((installed + 1))
  done
done

# OpenCode plugin: copy (plugins auto-load from ~/.config/opencode/plugins).
if [ -f "$PLUGIN_SRC" ]; then
  OPENCODE_PLUGINS="$HOME/.config/opencode/plugins"
  [ -d "$OPENCODE_PLUGINS" ] || mkdir -p "$OPENCODE_PLUGINS"
  cp "$PLUGIN_SRC" "$OPENCODE_PLUGINS/jev.js"
  installed=$((installed + 1))
fi

echo "JEV sincronizado: $installed arquivos em ${#TARGETS[@]} harnesses + plugin OpenCode."