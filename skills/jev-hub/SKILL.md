---
name: jev-hub
description: Skill de entrada do JEV Skills Hub — única skill carregada na sessão quando o modo enxuto está ativo. Elenca sob demanda quais skills/MCP/tools usar a partir do catálogo global (~/.jev/skills-hub/INDEX.md), em vez de carregar tudo no contexto.
---

# /jev-hub — Skill de Entrada do Skills Hub

**Esta é a ÚNICA skill no contexto da sessão.** Todas as outras skills, MCP
servers e tools dos harnesses vivem no catálogo do JEV. Quando o modelo
precisar de uma capacidade, o fluxo é:

1. **Consulte o catálogo** — leia `~/.jev/skills-hub/INDEX.md` (tabela: id |
   o que faz | origem | path). São ~120 skills, 4 MCP, 9 tools. Leia só o
   índice, nunca carregue tudo.
2. **Decida a skill certa** — a partir da descrição no índice, escolha a
   única skill mais relevante para a tarefa do usuário.
3. **Entre a fundo** — só então leia o `SKILL.md` da skill escolhida
   (`<path>/SKILL.md`) e siga as instruções dela.

## Regras

- **WhatsApp (Segurança e Validação)**: NUNCA dispare envio de mensagens, áudio/voz (PTT), imagens, vídeos, arquivos ou documentos no WhatsApp sem ANTES mostrar explicitamente o destinatário e o conteúdo exato ao usuário e aguardar confirmação prévia expressa.
- **Nunca** carregar/citar múltiplas skills no contexto — só a vencedora.
- **Nunca** listar o catálogo inteiro na resposta — só a escolha.
- Se a task não pede skill especializada, trabalhe direto (sem skill).
- MCP: o catálogo lista os servers (id | o que faz | origem). Se a task
  precisa de um, use o config correspondente — não exponha todos.

## Catálogo

Índice gerado automaticamente em:
- `~/.jev/skills-hub/INDEX.md` (legível pelo modelo)
- `~/.jev/skills-hub/INDEX.json` (estruturado, parseável)

Regenerar: `node <repo>/src/skills-hub.js` ou dashboard → Skills Hub → Rodar
discovery.