# UI Audit Test Fixtures

Fixtures for testing jev-ui-audit detection rules.

## Running Tests

Automatizado (Playwright + Chromium instalados):
```bash
node --test tests/ui-audit.test.js   # na raiz do jev-claude-engine
```

Manual:
```bash
python3 -m http.server 8765          # nesta pasta
jev ui-audit http://127.0.0.1:8765/test-page.html --routes / --viewports mobile --no-lighthouse
```

## Expected Findings (mobile)

| Rule | Expected Severity | Elemento |
|------|------------------|----------|
| horizontal-overflow | critical | `.overflow-container` (min-width 500px) |
| content-clipping | high | `.clipped-dropdown` |
| collapsed-element | medium | `.collapsed-sidebar` (width 0) |
| covered-element | high | `.covered-button` sob `.floating-overlay` (o `element-overlap` do mesmo botão é deduplicado aqui, com `coveredRatio`) |
| touch-target-size | low | `.small-touch-target` (< 44px) |
| a11y-image-alt | critical | `img` sem `alt` |
| a11y-color-contrast | high | botões com texto branco em fundo claro |

## responsive-page.html

Bugs plantados por media query, para provar que o audit separa viewports:

| Viewport | Bug | Finding |
|---|---|---|
| mobile/tablet (≤768px) | banner de 600px | `horizontal-overflow` `section.promo-banner` |
| mobile/tablet | título nowrap cortado sem ellipsis | `content-clipping` `h3` |
| mobile/tablet | widget de chat fixo sobre o "Entrar" | `covered-element` `button.btn.entrar` |
| mobile/tablet | stats com width 0 | `collapsed-element` `section.stats` |
| mobile/tablet | hambúrguer 20x20 | `touch-target-size` `button.hamburger` |
| desktop (≥1024px) | tabela de 1800px | `horizontal-overflow` `section.data-table` |
| desktop | nav com altura fixa cortando itens | `content-clipping` `ul` |
| desktop | painel lateral fixo sobre o "Salvar" | `covered-element` `button.btn.salvar` |
| desktop | botão só com ícone | `a11y-button-name` `.icon-only` |
| todos | imagem sem alt, texto #bbb | `a11y-image-alt`, `a11y-color-contrast` |

Controles que **não** podem gerar finding: tabela em container `overflow-x: auto`,
texto com `text-overflow: ellipsis`, ícone `pointer-events: none` dentro do input
de busca, label `.sr-only` e menu `display: none`.
