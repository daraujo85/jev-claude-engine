---
name: jev-model-router
description: Classify all 9Router models with JEV System One, suggest optimized combos (with failover chains for rate limits), and route tasks to the best combo. Use when the user asks "qual modelo usar pra X", "analisa os modelos do 9router", "cria um combo", or wants model routing decisions.
---

# JEV Model Router

Analisa **todos os modelos** do gateway 9Router (`/v1/models`), usa o JEV
System One pra classificar cada modelo pelo melhor tipo de tarefa, sugere
combos otimizados (com cadeia de failover quando um modelo estoura limite de
taxa), e roteia tarefas pro combo mais adequado.

## Pipeline

1. **Lista** modelos reais + combos do 9Router (via `GET /v1/models`).
2. **Profila** cada modelo real com JEV (`choice` + `score`):
   - `choice`: melhor tipo de tarefa (código, refactor, arquitetura, debug,
     testes, docs, review, análise de dados, escrita criativa, transcrição)
   - `score`: quão bom o modelo é pra tarefa escolhida
   - Usa as capacidades reais do gateway (vision, audio, tools, reasoning,
     context window) como contexto na classificação.
3. **Sugere combos**: agrupa por tarefa, ordena por score (melhor primeiro),
   e monta cadeia `primary → failover[]` — quando um modelo estoura o limite,
   o próximo da lista assume.
4. **Roteia tarefa**: dado um pedido, JEV escolhe o combo mais adequado.

## Uso

```bash
# pipeline completo: profile todos os modelos + sugere combos
node skills/jev-model-router/jev-model-router.js

# lista modelos reais e combos
node skills/jev-model-router/jev-model-router.js --list

# roteia uma tarefa pro combo mais adequado
node skills/jev-model-router/jev-model-router.js --task "refatorar modulo de auth"

# saída JSON (pra integrar em scripts/hooks)
node skills/jev-model-router/jev-model-router.js --json
```

## No Claude Code / OpenCode / Codex / AGY

Invoque `/jev-model-router` (via skills) ou use o CLI direto. O roteamento
escolhe o combo e o modelo `primary`; o failover garante plano B quando o
modelo principal atingir o limite de taxa (429/529).

## Notas

- Requer o gateway 9Router local (`http://localhost:20128`) e o token
  (`ANTHROPIC_AUTH_TOKEN` ou `NINEROUTER_TOKEN`).
- As decisões são primitivas System One (`choice`/`score`) — zero tokens de
  LLM generativo gastos no roteamento.
- A criação efetiva do combo no 9Router usa a API admin (`POST /api/combos`);
  este skill sugere a composição — crie com a skill `9router-combos` se
  aprovar.