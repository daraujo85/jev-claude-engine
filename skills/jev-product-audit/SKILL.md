---
name: jev-product-audit
description: Product Audit — garante que as regras de negócio de uma tarefa foram realmente atendidas. Extrai o que foi pedido do contexto (ticket Gira/Jira, PRD, ADR, conversa de WhatsApp, e-mail), compara com a entrega (diff, arquivos, testes) e gera um relatório de conformidade regra por regra. Use antes de considerar uma tarefa concluída, ao revisar uma PR, ou quando o contexto da tarefa veio de fora do repositório.
---

# /jev-product-audit — Auditor de Regras de Negócio

Responde duas perguntas antes de fechar uma tarefa:
1. **Entendimento**: o contexto original (de onde veio o pedido) foi interpretado corretamente?
2. **Conformidade**: a entrega cumpre cada regra de negócio pedida?

## Quando Usar
- Antes de mover uma tarefa para "Concluída".
- Ao revisar um PR que resolve uma tarefa macro.
- Quando o contexto veio de fora do repositório (ticket, WhatsApp, e-mail, reunião) e não existe PRD formal.
- Quando há suspeita de "achismo" — a entrega faz algo diferente do que foi pedido.

## Uso
```bash
# contexto via argumento (uma string com o pedido)
node /Users/diegoaraujo/Documents/projects/jev-claude-engine/skills/jev-product-audit/audit.js "O ticket diz: usuário deve poder cancelar o plano direto no app, sem ligar"

# contexto via arquivo (ticket exportado, PRD, transcrição de reunião)
node /Users/diegoaraujo/Documents/projects/jev-claude-engine/skills/jev-product-audit/audit.js --context docs/ticket-gira-123.md

# contexto via stdin (pipe do Gira/CLI/outra skill)
cat ticket.txt | node /Users/diegoaraujo/Documents/projects/jev-claude-engine/skills/jev-product-audit/audit.js

# limita o diff de entrega à branch atual (default) ou especifica base
node .../audit.js --context ticket.md --base main
```

## Como Funciona
1. **Colhe a entrega** — git diff da branch atual (ou `--base <ref>`), arquivos alterados e testes.
2. **Extrai as regras** — do contexto, sentenças de requisito (modais "deve/precisa/tem que", "não pode", critérios de aceite, bullets com ação esperada). Cada regra ganha um ID e a fonte (trecho original).
3. **Gera o relatório** — tabela markdown `regra | fonte | status | evidência` com status `⬜ por verificar` para o agente preencher.

## Critérios de Julgamento (o agente preenche o relatório)
Para cada regra extraída, o agente **deve** examinar a entrega e marcar:
- ✅ **Atendida** — há evidência clara (código, teste, comportamento) que cumpre a regra.
- 🟡 **Parcial** — cobre parte, mas há gap de comportamento.
- ❌ **Não atendida** — a regra foi pedida e não foi entregue.
- ❓ **Não verificável** — falta evidência; não assumir que foi feito.

**Regras de ouro:**
- A fonte da verdade é o **contexto original**, não a interpretação do desenvolvedor.
- Se uma regra está ambígua no contexto → marcar ❓ e perguntar, **nunca** assumir.
- Regra sem evidência em código/teste/PR = **não atendida**, mesmo que "pareça que funciona".
- Uma PR que resolve a tarefa mas não menciona uma regra pedida = gap a reportar.
- Se o diff é vazio (nada implementado ainda), reportar tudo como não verificado — não inventar.

## Output
O script imprime o esqueleto do relatório. O agente completa os status com a inspeção da entrega e devolve o relatório preenchido ao usuário, com resumo executivo:
```
REGRAS DE NEGÓCIO — RESUMO
  3/5 atendidas · 1 parcial · 1 não atendida

| ID | Regra | Fonte | Status | Evidência |
```