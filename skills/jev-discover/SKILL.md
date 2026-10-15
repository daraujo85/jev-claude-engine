---
name: jev-discover
description: Ultra-precise Discovery Pipeline combining Graphify (Knowledge Graph), GrepAI (Semantic Search & Tracing), and JEV System One (Fast Decision Scoring) before Claude inspects code.
---

# /jev-discover — Hybrid Discovery Pipeline

Pipeline em 4 estágios de alta precisão e baixo consumo de contexto:
1. **Graphify**: Mapeia comunidades e relações estruturais do grafo de conhecimento.
2. **GrepAI**: Realiza busca vetorial semântica e rastreamento de referências/chamadas.
3. **JEV System One**: Pontua (1-10) todos os candidatos simultaneamente em <200ms.
4. **Claude Code**: Lê e processa apenas os 2 a 3 arquivos vencedores.

## Uso
```bash
node /Users/diegoaraujo/Documents/projects/jev-claude-engine/skills/jev-discover/discover.js "<conceito ou pergunta sobre o código>"
```
Ou no Claude Code: `/jev-discover <pergunta>`
