---
name: requirements-elicitation
description: Elicitação de requisitos — levanta o que precisa ser feito a partir do contexto bruto (ticket Gira/Jira, PRD, ADR, transcrição de reunião, WhatsApp/e-mail) e produz o insumo formal de validação. Extrai obrigações verificáveis, critérios de aceite, cenários BDD, ambiguidades e lacunas, e gera artefatos mermaid (sequência, classes/ER, componentes, ADR) persistidos em ~/.jev/artifacts/. O requirements.md gerado serve de --context pra business-acceptance-review no final.
---

# /requirements-elicitation — Levantamento de Requisitos

Produz a **base de validação** antes de desenvolver. O que sai daqui alimenta o
`business-acceptance-review` no final (mesma fonte da verdade).

## Uso
```bash
# contexto via argumento
node /Users/diegoaraujo/Documents/projects/jev-claude-engine/skills/requirements-elicitation/elicit.js "Requisito: dois responsáveis acompanham o mesmo aluno via convite"

# contexto via arquivo (ticket exportado, PRD, transcrição)
node .../elicit.js --context docs/ticket-gira-123.md

# contexto via stdin
cat ticket.txt | node .../elicit.js

# nome do requisito/card (pra nomear os artefatos)
node .../elicit.js --context ticket.md --name B2B-437
```

## O que produz
1. **Requisitos** — obrigações extraídas (explícitas vs hipóteses/ambíguas).
2. **Critérios de aceite + cenários BDD** — Dado/Quando/Então, principal + alternativa/fronteira.
3. **Ambiguidades e lacunas** — o que falta definir (expiração, permissões, fronteiras, exceções) → perguntas ao PO.
4. **Artefatos mermaid** (em `~/.jev/artifacts/<nome>/`):
   - `sequence.mmd` — diagrama de sequência por cenário (automatizado)
   - `er.mmd` — classes/entidades + relacionamentos (esqueleto automático)
   - `components.mmd` — atores/sistemas envolvidos (esqueleto)
   - `adr.md` — ADR template com as decisões levantadas
5. **`requirements.md`** — documento consolidado (salvo em `~/.jev/requirements/`).

## Regras de ouro
- Fonte da verdade é o **contexto original** — não a interpretação de quem lê.
- Requisito ambíguo → marcar como hipótese e virar pergunta ao PO, **nunca** assumir.
- Lacuna (expiração/permissão/fronteira/exceção) → registrar, não inventar regra.
- Esqueletos de classes/ER/componentes são **ponto de partida** — o agente refina com a arquitetura real.
- O `requirements.md` gerado aqui é o `--context` do `business-acceptance-review` na validação final.

## Fluxo da skill
1. **Ler a fonte** — ticket, PRD, ADR, transcrição, WhatsApp/e-mail.
2. **Extrair obrigações** — atores, permissões, condições, ações, resultados, exceções.
3. **Marcar ambiguidades** — explícito vs hipótese vs informação ausente.
4. **Montar cenários de aceitação** — caminho principal, alternativas, bloqueios, fronteiras.
5. **Gerar artefatos mermaid** — sequência, classes/ER, componentes, ADR.
6. **Persistir** — `requirements.md` + artefatos em `~/.jev/`.
7. **Entregar** — documento + lista de perguntas ao PO + caminhos dos artefatos.