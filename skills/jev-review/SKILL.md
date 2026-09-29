---
name: jev-review
description: Fast 7-Question Code Review Pre-filter powered by JEV. Approves trivial/safe changes in 200ms with zero LLM tokens and escalates risky diffs with targeted guidance.
---

# Code Review Pre-Filter (JEV)

Pré-avalia alterações via `git diff` respondendo 7 perguntas binárias críticas em frações de segundo.

## Uso
```bash
node /Users/diegoaraujo/Documents/projects/jev-claude-engine/skills/jev-review/review.js
```
Ou execute `/jev-review` diretamente no Claude Code antes de abrir PRs ou commits.
