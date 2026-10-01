---
name: jev-project-profile
description: Generates .claude/jev-profile.md capturing a repository's architecture (layers, patterns), code style and front-end design system. Uses a hybrid flow: run the deterministic scan (scripts/jev-profile.js), then COMPLEMENT it as the LLM — read manifests (package.json/pom.xml/go.mod/requirements.txt/*.csproj/pubspec.yaml), query the Graphify knowledge graph, and inspect entrypoints to detect the real stack, libraries and patterns the regex scan missed, and remove false positives. Use when asked "qual a arquitetura desse projeto", "como é o code style", "gera o perfil do projeto", "cria o jev-profile", or when a subagent should follow the project's conventions. ALSO use whenever the conversation contains a DIVERGENCE/CRITICISM about the expected pattern — code comments policy, code language (English/Portuguese), naming, folder structure, design tokens, branch/PR/commit flow, architecture layers — or when the user states a project convention: interview the user to confirm the rule, write it to .claude/jev-rules.md and regenerate the profile (petrified rule, subagents follow it). Auto-runs on SessionStart when the profile is missing.
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
| **Stack** | package.json, composer.json, *.csproj, go.mod, Cargo.toml, requirements.txt, Gemfile, pubspec.yaml... |
| **Camadas** | controllers, services, repositories, domain, use-cases, commands, queries, routes, middlewares, tests... |
| **Padrões** | CQRS/Command-Query, Repository, Service layer, MVC, DI, ORM, event-driven... |
| **Testes** | node:test, Jest/Vitest, pytest, xUnit/NUnit, JUnit/TestNG (auto-detectado) |
| **Code style** | tabs/espaços, ponto-e-vírgula, camelCase/snake_case, tamanho de linha |
| **Design system** | CSS variables (tokens), lib UI (Tailwind/MUI/shadcn/PrimeVue), componentes, ícones |

## Mapeamento híbrido (determinístico + LLM + Graphify)

O scan determinístico (`scripts/jev-profile.js`) é o **ponto de partida** —
rápido e sem custo de LLM — mas **não é 100%**: a quantidade de tecnologias
é grande demais pra cobrir tudo por regex. O perfil só fica completo quando
você (o LLM) **complementa** o resultado:

1. **Rode o scan**: `node skills/jev-project-profile/jev-project-profile.js .`
   → gera o `.claude/jev-profile.md` base + imprime o resumo no console.
2. **Rode `--json`** pra ver o que o scan detectou:
   `node skills/jev-project-profile/jev-project-profile.js . --json`
3. **Varredura complementar — você faz**:
   - **Manifests**: leia `package.json`, `pom.xml`, `build.gradle`, `go.mod`,
     `Cargo.toml`, `requirements.txt`/`pyproject.toml`, `*.csproj`, `composer.json`,
     `pubspec.yaml` — e liste as **bibliotecas/starters relevantes** que faltam
     no stack (ex: Spring Boot, PrimeVue, Pinia, Tailwind, vue-router, EF Core,
     FastAPI, Django, Laravel, Riverpod...).
   - **Graphify**: se existir `graphify-out/graph.json`, rode
     `graphify query "quais as principais tecnologias e bibliotecas deste projeto?"`
     e `graphify explain "<módulo>"` pra confirmar camadas, padrões e
     dependências reais.
   - **Arquivos-chave**: leia o entrypoint (`main.py`, `Program.cs`,
     `server.ts`, `lib/main.dart`, `src/main.tsx`...) e 2-3 arquivos de cada
     camada pra confirmar o padrão (CQRS, Repository, Service, etc.).
4. **Corrija o `.claude/jev-profile.md`**: acrescente o que o scan perdeu
   (bibliotecas, camadas, padrões) e **remova falsos positivos** (ex:
   tecnologia que o scan casou por substring mas não existe no projeto).
   Para o complemento manual **sobreviver à regeneração**, envolva-o nos
   delimitadores `<!-- jev-manual:start -->` ... `<!-- jev-manual:end -->`.
   Tudo que estiver dentro desses marcadores é preservado quando o scan roda
   de novo; o resto do arquivo é sobrescrito. (Regras do time vão no
   `jev-rules.md`, que também é preservado.)
5. Se o scan errou de forma **recorrente** (mesma regra em vários projetos),
   anote o gap — o engine determinístico pode ser corrigido depois; não
   perca tempo caçando regex a cada projeto.

**Regra**: o scan é o rascunho; o LLM é quem valida e completa. O arquivo
final reflete a realidade do projeto, não a heurística.

## Hook automático (SessionStart)

Se o projeto tem `.git` mas não tem `.claude/jev-profile.md`, o hook
`jev-project-profile` gera o perfil ao abrir a sessão — o agente já começa
sabendo a arquitetura e o estilo do código.

## Regras do time (`jev-rules.md`)

Convenções que o scan **não consegue detectar** (fluxo de branch, política
de comentários, regras de PR...) ficam num arquivo manual:

```markdown
# .claude/jev-rules.md
- **Sem comentários no código.** ...
- **Branches:** nunca commitar direto na release — só via PR...
```

O gerador incorpora esse arquivo como seção **Project rules** no
`jev-profile.md`, e os subagents seguem. Regenerar o profile não apaga as
regras (elas vivem no arquivo separado).

## Capturar convenções da conversa

Quando o usuário **mencionar na conversa** uma convenção de projeto que não
dá pra detectar por scan — code style obrigatório (ex: "não coloque
comentários no código"), fluxo de branches (ex: "nunca commitar direto na
release, só via PR"), padrão de commits, arquitetura obrigatória, política de
testes/PR — **adicione ao `.claude/jev-rules.md` do projeto** e regenere o
profile:

1. Verifique se `.claude/jev-rules.md` existe no projeto atual.
2. Se não existe, crie com o cabeçalho `# Project rules`.
3. Adicione a convenção como um bullet (mantenha as existentes).
4. Rode `node scripts/jev-profile.js .` pra regenerar o `.claude/jev-profile.md`
   com a nova seção incorporada.

Isso vale pra regra nova OU pra correção/refino de regra existente. Sempre
preserve as regras já listadas.

## Detecção proativa de divergência (cláusula pétrea)

Qualquer sinal na conversa de que **o padrão esperado não foi seguido** — ou
que existe um padrão ainda não registrado — é gatilho pra agir. Exemplos de
sinais:

- **Code style**: crítica a comentários ("não devia ter comentário", "faltou
  comentário"), idioma do código ("devia estar em inglês/português"), indentação,
  ponto-e-vírgula, nomes de variável/constante.
- **Naming/estrutura**: crítica a nome de pasta/arquivo, organização de camadas,
  localização de um componente/arquivo.
- **Design system**: "essa cor não existe no projeto", "use o token certo",
  "temos esse componente no design system".
- **Fluxo de trabalho**: "nunca commitar direto na release", "PR deve vir de
  branch de trabalho", "só merge via PR", padrão de commit (conventional, etc.),
  política de testes/PR/review.
- **Arquitetura**: "aqui usamos CQRS/DDD/camadas X", "não é assim que
  organizamos esse domínio".

**Fluxo obrigatório**:

1. **Detectou** qualquer um desses sinais na conversa → pare e **entreviste o
   usuário** (pergunta curta, 1-3 opções quando fizer sentido) pra confirmar a
   regra e tirar a dúvida. Não assuma sozinho.
2. **Esclarecido** (usuário confirmou a regra) → escreva no
   `.claude/jev-rules.md` do projeto (crie se não existir, preserve as regras
   existentes).
3. **Regenere** o `.claude/jev-profile.md` (`node scripts/jev-profile.js .`).
4. Se o usuário respondeu com uma **exceção/refino** ("mas em X pode") →
   registre a regra com a exceção explícita.

**Regra de ouro**: uma vez registrada, a regra vale pra sempre (cláusula
pétrea). Os subagents `jev-*` leem o profile antes de codar — depois que a
regra está no arquivo, o agente **não comete mais o gap**. A regra só muda se
o usuário pedir explicitamente pra mudar.

## Notas

- Heurística baseada em arquivos — não depende de toolchain instalado.
- Rápido (segundos), zero LLM, zero rede.
- O perfil gerado é Markdown legível por LLM; os subagents o leem antes de
  cada tarefa de código.