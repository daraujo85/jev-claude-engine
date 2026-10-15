---
name: jev-plan-evaluator
description: Bugfix & Plan Evaluator powered by JEV System One. Avalia se o plano de resolução ou hipótese da IA realmente resolve a causa-raiz de um problema ou se apenas mascara sintomas, calcula probabilidade de sucesso e previne regressões antes de escrever código.
---

# /jev-plan-evaluator — Validador de Planos e Hipóteses de Bugfix

Evite o viés de otimismo da IA. Antes de sair escrevendo código ou refatorando, passe o problema e o plano proposto para o JEV avaliar a probabilidade real de sucesso e o risco de regressão.

## Quando Usar
- Durante a fase de **Design / Planejamento** de uma correção de bug.
- Ao investigar erros complexos, intermitentes ou problemas de concorrência/idempotência.
- Antes de autorizar grandes refatorações que podem causar efeitos colaterais.

## Uso
```bash
node /Users/diegoaraujo/Documents/projects/jev-claude-engine/skills/jev-plan-evaluator/evaluator.js "<descrição do problema / erro>" "<plano proposto>"
```
Ou no Claude Code / AGY: `/jev-plan-evaluator "<problema>" "<plano>"`
