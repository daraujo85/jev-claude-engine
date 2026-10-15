---
name: jev-fanout
description: Decompose a large task into independent parallel sub-tasks with JEV System One, route each sub-task to the best 9Router model/combo (via jev-model-router), and validate the aggregated result for full coverage. Use when the user asks "fan out", "decompose this task in parallel", "split this into subagents", or a task is large enough to run as parallel subagents.
---

# JEV Fan-out

Quebra uma tarefa grande em **sub-tarefas paralelas independentes**, roteia
cada uma pro **melhor modelo/combo do 9Router** (usando o `jev-model-router`),
e valida no final se o conjunto cobriu a tarefa original.

Tudo com primitivas System One (`choice`/`noul`/`score`) — zero tokens de LLM
generativo gastos no planejamento.

## Pipeline

1. **Decompose** — JEV decide se a tarefa merece fan-out e quebra em até 3
   sub-tarefas paralelas (`write_code`, `refactor`, `test`, `review`, `docs`,
   `research`, `debug`). Se não valer a pena → executa como unidade única.
2. **Route** — cada sub-tarefa é roteada pro combo/modelo mais adequado do
   9Router (mesmo mecanismo do `jev-model-router`).
3. **Validate** — ao agregar os resultados, JEV confirma (noul) se a tarefa
   original foi coberta sem lacunas.

## Uso

```bash
# decompor + plano de roteamento
node skills/jev-fanout/jev-fanout.js "refatorar modulo de auth e escrever testes"

# JSON (pra scripts/orquestração)
node skills/jev-fanout/jev-fanout.js "tarefa" --json

# validar cobertura do resultado agregado
node skills/jev-fanout/jev-fanout.js "tarefa" --validate "<resultado>"
```

## No agente

Execute cada sub-tarefa do plano num **subagente paralelo** (ex.: Claude Code
`Task` / Codex subagents / OpenCode tasks) apontando pro combo/modelo roteado.
Depois rode `--validate` com o resultado agregado pra fechar o ciclo.

## Notas

- Requer o gateway 9Router local configurado (dashboard → **9Router**:
  base URL + API key) e o catálogo de modelos em `src/model-catalog.js`
  (custo, latência, benchmarks) pra ponderação de custo-benefício.
- O fan-out respeita os toggles do dashboard: `router.model_profiler`,
  `router.combo_suggester`, `router.task_router`.