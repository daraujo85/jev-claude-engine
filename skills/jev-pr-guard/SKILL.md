---
name: jev-pr-guard
description: Validação determinística de branches e regras de Pull Request (PR) powered by JEV System One. Intercepta comandos de criação de PR (gh pr create, az repos pr create, glab mr create) e garante conformidade absoluta com as regras do projeto (ex.: proibição de develop direto para release no Git Flow clássico). Se o projeto não possuir regras de PR definidas, interrompe a criação e orienta a perguntar ao usuário.
---

# /jev-pr-guard — Validação de Pull Request & Branches

Garante que nenhuma Pull Request seja criada violando as convenções e políticas de branches do repositório.

## O Que Ele Evita
1. **PRs Ilegais entre Branches:** Bloqueia fluxos proibidos pelo time (por exemplo, no Git Flow clássico: **nunca** abrir PR direto de `develop` para `release` — é obrigatório criar uma branch específica com os commits selecionados/cherry-pick e abrir a PR dessa branch para `release`).
2. **Criação de PR sem Regras Definidas:** Se o projeto não possui regras de PR registradas em `.claude/jev-rules.md`, o guard interrompe a execução com exit code 2 e exige que o assistente pergunte as regras ao usuário antes de prosseguir.
3. **Erros no Git Flow / Release Flow:** Evita que alterações não testadas ou commits indesejados contaminem branches de produção e homologação.

## Como Funciona
- **Hook PreToolUse Automático:** Intercepta qualquer comando de criação de PR (`gh pr create`, `az repos pr create`, `glab mr create`) antes que ele seja executado.
- **Validação Determinística + JEV System One:** Compara a branch de origem (`--head`/`--source-branch`) e destino (`--base`/`--target-branch`) contra as regras declaradas em `.claude/jev-rules.md`, `.claude/jev-profile.md` e `CLAUDE.md`.
- **Feedback Visual Imediato:** Renderiza um card visual no terminal com a branch, o status e as instruções de correção caso a PR seja rejeitada.

## Comandos CLI JEV
```bash
# Visualizar as regras de PR do projeto atual
jev pr-rules

# Adicionar ou atualizar uma regra de PR/branch
jev pr-rules set "Nunca abrir PR de develop para release direto. Criar branch de release específica."

# Validar manualmente uma combinação de branches
jev pr-validate --head=develop --base=release
jev pr-validate --head=feature/minha-feature --base=develop
```
