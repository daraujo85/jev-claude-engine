---
name: jev-anti-regression
description: Sentinel Anti-Regressão powered by JEV System One. Analisa o git diff e alterações de código para impedir que o LLM quebre contratos existentes, delete lógica funcional prévia ou cause regressões em código que já estava funcionando.
---

# /jev-anti-regression — Sentinel Anti-Regressão

Detecta e previne regressões funcionais, quebras de assinaturas públicas e deleção indevida de regras de negócio antes que o código quebrado seja gravado ou commitado.

## O Que Ele Evita
1. **Quebra de Assinaturas e Contratos:** Remoção ou renomeação de parâmetros em funções públicas que outros módulos utilizam.
2. **Deleção de Lógica Funcional:** Substituição preguiçosa de código funcional por stubs, placeholders ou implementações incompletas.
3. **Desativação de Testes:** Casos onde a IA comenta ou enfraquece asserções de testes para fazer a esteira passar.
4. **Efeitos Colaterais Ocultos:** Alteração de estado compartilhado ou esquemas que causam regressão silenciosa.

## Uso
```bash
node /Users/diegoaraujo/Documents/projects/jev-claude-engine/skills/jev-anti-regression/guard.js
```
Ou no Claude Code: `/jev-anti-regression`
