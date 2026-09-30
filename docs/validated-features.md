# JEV Features — Validadas (registro)

Testadas de verdade e aprovadas. Cada feature: o que faz, como foi validada,
comando de teste. Depois de ok → dashboard com toggle + tooltip.

## 1. Model Router (9Router) — rotas de tarefa para combo

- **O que**: classifica uma tarefa com JEV System One (choice/score, zero LLM)
  e mapeia pro combo certo do gateway 9Router.
- **Validado**: `Pong → claude-coder (88%, 350ms)`, `docs → claude-tools`,
  `bug → claude-coder`, pergunta geral → none. Medido em
  `src/task-router.js` (`routeToSubagent`).
- **Uso**: hook `UserPromptSubmit` → `jev-task-router.js`.
- **Comando**: `node -e "import('./src/task-router.js').then(({routeToSubagent}) => routeToSubagent('Crie um jogo Pong'))"`

## 2. Subagents por tarefa (model correto por delegação)

- **O que**: um subagent `.claude/agents/jev-*.md` por tipo de tarefa, com
  `model: <combo>` no frontmatter. Claude Code delega quando a tarefa bate
  com a description. Teste real confirmou: `model: claude-coder` →
  gateway roteou pra `cc/claude-haiku-4-5` (log: `query_source: agent:custom`).
- **Validado**: sessão Claude Code real via tmux, prompt de código → log do
  gateway mostrou combo + modelo usados.
- **Importante**: subagents ficam em `~/.claude/agents/` (user-level, todas
  sessões). Gerador: `node scripts/generate-subagents.js`.
- **Observação**: delegação acontece quando a tarefa é grande; tarefa pequena
  o Claude Code executa inline (comportamento intencional do prompt).

## 3. Project Profile (arquitetura + code style + design system)

- **O que**: escaneia o repo e gera `.claude/jev-profile.md` com stack,
  camadas, padrões, testes, code style e design tokens. Subagents leem
  antes de codar → código novo segue a arquitetura e o estilo existentes.
- **Validado** (projeto `/tmp/pong-arch`, Express + CQRS + Repository):
  - Layers detectados: commands, controllers, domain, repositories,
    services, use-cases, routes, middlewares, tests
  - Patterns: MVC, Repository, Service layer, CQRS/Command-Query, DI
  - Tests: `node:test` (não confundiu com Jest)
  - Style: spaces, camelCase, semicolons yes
  - Design tokens: 10 CSS vars (`--color-primary`, `--spacing-*`, ...)
- **Teste de obediência**:
  - Backend: feature "nome do jogo" → seguiu CQRS (command → service →
    domain), validação no domain (`ValidationError` → 400), testes node:test.
  - Frontend: scoreboard header → usou SÓ tokens existentes, zero cor/fonte
    nova. Relatado: `--color-primary`, `--color-accent`, `--spacing-md`, etc.
- **Comando**: `node scripts/jev-profile.js [dir]` (gera o .md) | `--json`

## 4. Dashboard 9Router — profiler + combos + key

- **O que**: view 9Router com key mascarada (reveal/hide), Test connection
  (via proxy server, resolve CORS), botão "Run profiler" que classifica os
  modelos ao vivo, monta combos com failover e persiste
  (`router.suggested_combos`). Ícones SVG por tarefa.
- **Validado**: profiler → 102 modelos → 7 combos `claude-*`; save de key
  digitar/colar persiste; Test connection "OK — 158 models".
- **Comando**: `node bin/jev.js dashboard --port 3838` → view `?view=router`

## 5. Combos com nome compatível Claude Code

- **O que**: nomes de combo `claude-<task>` (ex: `claude-writing-code`),
  não `jev-*`. Claude Code só aceita prefixo `claude`.
- **Validado**: profiler + subagents usam `claude-*` sem warning bloqueante.

## 6. Estado dos harnesses (roteamento por subagent)

| Harness | Task-router hook | Subagents jev-* | Modelo por subagent |
|---|---|---|---|
| **Claude Code** | `hooks/jev-task-router.js` no UserPromptSubmit (settings.json) | `~/.claude/agents/jev-*.md` (10) | `model:` frontmatter → combo 9Router ✓ (validado no gateway log) |
| **OpenCode** | plugin `plugins/jev.js` (`chat.message` + `system.transform`) | `~/.config/opencode/agent/jev-*.md` (10) | `model: 9router/<combo>` ✓ |
| **Codex** | `hooks.json` UserPromptSubmit (jev-task-router.js) ✓ | sem subagents custom (limitação Codex) | N/A — hook injeta diretiva, executa inline |
| **AGY** | `hooks/jev-task-router-gemini.js` no UserPromptSubmit ✓ | sem subagents custom (limitação AGY) | N/A — hook injeta diretiva, executa inline |

**Fix**: `jev-task-router` agora está no `DEFAULT_CONFIG.hooks` (antes não estava → `isEnabled` retornava undefined e o hook saía cedo em todos os harnesses). Fix no dashboard: `collectConfig` preserva `suggested_combos` + `task_combos` ao salvar (antes o Save apagava os combos).

**Gerador**: `node scripts/generate-subagents.js` → gera agentes nos 3 formatos:
- `~/.claude/agents/jev-*.md` (Claude Code: `tools` + `model: <combo>`)
- `~/.config/opencode/agent/jev-*.md` (OpenCode: `mode: subagent`, `model: 9router/<combo>`)
- `.claude/agents/` no repo (projeto)