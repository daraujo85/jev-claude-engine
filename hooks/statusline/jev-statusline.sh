#!/bin/bash
# Claude Code statusline: show JARVIS state (per-session on/off, global away, voice/lang)
# plus basic context (cwd + git branch + model). Fed JSON on stdin by Claude Code.
# Wire up in ~/.claude/settings.json:  "statusLine": { "type": "command", "command": "~/.claude/hooks/jarvis-statusline.sh" }

IN="$(cat)"

jq_get() {  # read a dotted path from the stdin JSON; falls back to python if jq is missing
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$IN" | jq -r "$1 // empty" 2>/dev/null
  else
    printf '%s' "$IN" | python3 -c "import json,sys;d=json.load(sys.stdin)
p='$1'.lstrip('.').split('.')
for k in p:
    d=d.get(k,{}) if isinstance(d,dict) else {}
print(d if isinstance(d,str) else '')" 2>/dev/null
  fi
}

SID="$(jq_get '.session_id')"
[ -z "$SID" ] && SID="${CLAUDE_CODE_SESSION_ID:-default}"
CWD="$(jq_get '.workspace.current_dir')"; [ -z "$CWD" ] && CWD="$(jq_get '.cwd')"; [ -z "$CWD" ] && CWD="$PWD"
MODEL="$(jq_get '.model.display_name')"

FLAG="$HOME/.claude/tts-enabled-$SID"
ALL_FLAG="$HOME/.claude/tts-enabled-all"
AWAY_FLAG="$HOME/.claude/tts-away"
NAME_FILE="$HOME/.claude/tts-name-$SID"
CONFIG="$HOME/.claude/tts-config"
get_cfg() { grep -E "^$1=" "$CONFIG" 2>/dev/null | tail -1 | cut -d= -f2; }

# ANSI colors
DIM='\033[2m'; RST='\033[0m'; GRN='\033[32m'; RED='\033[31m'; YEL='\033[33m'; CYN='\033[36m'; MAG='\033[35m'

# --- JARVIS segment ---
# "on" if this session is enabled OR the global all-sessions flag is set.
if [ -f "$FLAG" ] || [ -f "$ALL_FLAG" ]; then
  J="${GRN}●JARVIS on${RST}"
  [ -f "$ALL_FLAG" ] && J="$J ${YEL}✦all${RST}"
else
  J="${DIM}○JARVIS off${RST}"
fi
if [ -f "$AWAY_FLAG" ]; then
  J="$J ${YEL}✈away${RST}"
fi
# voice/lang only matter when on
if [ -f "$FLAG" ] || [ -f "$ALL_FLAG" ]; then
  ENG="$(get_cfg ENGINE)"; LANG="$(get_cfg LANG)"
  EXTRA=""
  [ -n "$ENG" ]  && EXTRA="$EXTRA ${CYN}${ENG}${RST}"
  [ -n "$LANG" ] && EXTRA="$EXTRA ${MAG}${LANG}${RST}"
  J="$J${EXTRA}"
  [ -f "$NAME_FILE" ] && J="$J ${DIM}\"$(cat "$NAME_FILE")\"${RST}"
fi

# --- context segment ---
DIRNAME="$(basename "$CWD")"
BRANCH=""
if git -C "$CWD" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  BRANCH="$(git -C "$CWD" branch --show-current 2>/dev/null)"
  [ -n "$BRANCH" ] && BRANCH=" ${DIM}⎇ ${BRANCH}${RST}"
fi

# --- JEV segment ---
# "on" if an API key is available (env or ~/.jev/config.json) AND at least
# one hook is enabled in ~/.jev/config.json.
JEV_KEY=""
[ -n "$JEV_API_KEY" ] && JEV_KEY="$JEV_API_KEY"
[ -z "$JEV_KEY" ] && [ -n "$TYPESAFE_API_KEY" ] && JEV_KEY="$TYPESAFE_API_KEY"
if [ -z "$JEV_KEY" ] && [ -f "$HOME/.jev/config.json" ]; then
  JEV_KEY="$(python3 -c "import json,os;d=json.load(open(os.path.expanduser('~/.jev/config.json')));print(d.get('jev',{}).get('api_key',''))" 2>/dev/null)"
fi

JEV_HOOKS_ON=0
if [ -f "$HOME/.jev/config.json" ]; then
  JEV_HOOKS_ON="$(python3 -c "
import json,os
d=json.load(open(os.path.expanduser('~/.jev/config.json')))
hooks=d.get('hooks',{})
on=sum(1 for h in hooks.values() if h.get('enabled',True))
print(on)
" 2>/dev/null)"
else
  # no config file → defaults apply (all hooks enabled)
  JEV_HOOKS_ON=4
fi

if [ -n "$JEV_KEY" ] && [ "${JEV_HOOKS_ON:-0}" -gt 0 ]; then
  JEV="${GRN}⚡JEV on${RST}"
  # show how many hooks are active
  JEV="$JEV ${DIM}${JEV_HOOKS_ON}✓${RST}"
else
  JEV="${DIM}○JEV off${RST}"
fi

printf "%b" "$J ${DIM}│${RST} ${CYN}${DIRNAME}${RST}${BRANCH}${MODEL:+ ${DIM}│ ${MODEL}${RST}} ${DIM}│${RST} ${JEV}"
