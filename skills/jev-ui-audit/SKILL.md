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

## Instalação

Na raiz do `jev-claude-engine` (uma vez por máquina):

```bash
npm install                        # axe-core + playwright
npx playwright install chromium    # baixa o Chromium headless usado pelo audit
```

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

# Gate mode (falha se score < 80 ou se algum analyzer falhou)
jev ui-audit http://localhost:4200 --gate

# Sem axe / sem Lighthouse (o Lighthouse ainda é simulado)
jev ui-audit http://localhost:4200 --no-a11y --no-lighthouse

# Logado
jev ui-audit https://app.com --login-url https://app.com/login --username user@email.com --password '***'
```

## Analyzers

| Regra | Analyzer | Observação |
|---|---|---|
| `horizontal-overflow` | overflow | página mais larga que o viewport |
| `content-clipping` | clipping | conteúdo cortado por `overflow: hidden/clip` (auto/scroll não conta) |
| `element-overlap` | overlap | interativo tapado (≥15% da área) por outro elemento |
| `collapsed-element` / `covered-element` | visibility | elemento com conteúdo e tamanho zero / interativo coberto no centro |
| `touch-target-size` | touch-target | só em viewport touch: < 24px (medium) ou < 44px (low) |
| `a11y-*` | accessibility | axe-core com as tags WCAG 2.0/2.1 A e AA |

Analyzer que quebra **não some**: entra em `summary.failedAnalyzers`, o summary avisa
"Audit INCOMPLETO" e o `--gate` reprova. Testes: `node --test tests/ui-audit.test.js`
(usa `fixtures/test-page.html`).

## Output

Gera `report.json` em `<--output>/<run-id>/` (padrão `.jev/ui-audit/`), com
`summary` (score, `complete`, `failedAnalyzers`, contagem por severidade/categoria)
e a lista de `findings`. Senha e cookie saem mascarados no `config` do relatório.
