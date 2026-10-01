---
name: jev-project-profile
description: Scans a repository and generates .claude/jev-profile.md capturing its architecture (layers, patterns), code style and front-end design system. Use when asked "qual a arquitetura desse projeto", "como é o code style", "gera o perfil do projeto", "cria o jev-profile", or when a subagent should follow the project's conventions. Auto-runs on SessionStart when the profile is missing.
---

# JEV Project Profile

Gera o **perfil do projeto** — `.claude/jev-profile.md` — que descreve a
arquitetura, o code style e o design system do repositório atual. Os
subagents JEV (`jev-writing-code`, `jev-docs`, ...) leem esse arquivo antes
de escrever código, pra que o trabalho novo **siga o padrão existente** em
vez de inventar estrutura, estilo ou tokens.

## Quando rodar

- O usuário pede a arquitetura/code style do projeto.
- O usuário quer criar o perfil (`.claude/jev-profile.md`) pra primeira vez.
- Um subagent vai codar e o perfil ainda não existe.
- Automaticamente no **SessionStart** (hook) quando o arquivo está ausente.

## Uso

```bash
# gera .claude/jev-profile.md no projeto atual (ou no dir passado)
node skills/jev-project-profile/jev-project-profile.js [dir]

# saída JSON (stack, camadas, padrões, testes, style, design tokens)
node skills/jev-project-profile/jev-project-profile.js [dir] --json

# verifica se o perfil já existe (exit 0 = tem, 1 = não tem)
node skills/jev-project-profile/jev-project-profile.js [dir] --check
```

## O que o scan detecta

| Eixo | Sinais |
|---|---|
| **Stack** | package.json, composer.json, *.csproj, go.mod, Cargo.toml, requirements.txt, Gemfile... |
| **Camadas** | controllers, services, repositories, domain, use-cases, commands, queries, routes, middlewares, tests... |
| **Padrões** | CQRS/Command-Query, Repository, Service layer, MVC, DI, ORM, event-driven... |
| **Testes** | node:test, Jest/Vitest, pytest, xUnit/NUnit (auto-detectado) |
| **Code style** | tabs/espaços, ponto-e-vírgula, camelCase/snake_case, tamanho de linha |
| **Design system** | CSS variables (tokens), lib UI (Tailwind/MUI/shadcn), componentes, ícones |

## Hook automático (SessionStart)

Se o projeto tem `.git` mas não tem `.claude/jev-profile.md`, o hook
`jev-project-profile` gera o perfil ao abrir a sessão — o agente já começa
sabendo a arquitetura e o estilo do código.

## Notas

- Heurística baseada em arquivos — não depende de toolchain instalado.
- Rápido (segundos), zero LLM, zero rede.
- O perfil gerado é Markdown legível por LLM; os subagents o leem antes de
  cada tarefa de código.