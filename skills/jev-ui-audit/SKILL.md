---
name: jev-ui-audit
description: Deterministic responsive UI/layout auditor for web applications. Detects overflow, clipping, overlap, hidden/off-screen elements, touch issues, accessibility violations and CSS root-cause candidates across desktop/tablet/mobile, producing compact evidence for coding agents.
---

# /jev-ui-audit

Auditor determinístico de UI/layout para aplicações web renderizadas.

## Quando Usar

Quando uma interface web renderizada precisa de validação objetiva de UI/layout através de viewports responsivos (desktop/tablet/mobile).

## Detecta

- Horizontal overflow
- Elementos fora do viewport
- Clipping (conteúdo cortado)
- Overlap/colisão de elementos
- Fixed/sticky occlusion
- Elementos invisíveis/ocultos
- Imagens quebradas
- Touch targets muito pequenos
- Problemas de Flexbox/Grid
- Inconsistências responsivas
- Violações de accessibility (axe-core)
- Regressões visuais (opcional)

## Regra Principal

Prefira evidência determinística do browser sobre opinião visual.

Quando um defeito é encontrado, retorne o menor bundle de evidências útil: route, viewport, elemento, medições, causa CSS provável.

## Uso via CLI

```bash
# Audit básico
jev ui-audit http://localhost:4200

# Com rotas específicas
jev ui-audit http://localhost:4200 --routes /,/login,/dashboard

# Viewports específicos
jev ui-audit http://localhost:4200 --viewports mobile,desktop

# Output JSON
jev ui-audit http://localhost:4200 --json

# Gate mode (falha se score < 80)
jev ui-audit http://localhost:4200 --gate
```

## Output

Gera relatório em `.jev/ui-audit/<run-id>/`:
- `summary.json` — score e overview
- `findings.json` — todos os findings
- `report.html` — relatório HTML
- `screenshots/` — screenshots por finding
