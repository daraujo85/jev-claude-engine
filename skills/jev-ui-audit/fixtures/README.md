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

## stress-page.html

Bugs plantados (manifesto completo em `stress-page.expected.json`):

| Viewport | Bug | Finding |
|---|---|---|
| todos | zoom bloqueado (`user-scalable=no`) | `a11y-meta-viewport` |
| todos | imagem 404 | `broken-image` `img.produto-quebrado` |
| todos | e-mail só com placeholder / `<label>` CPF sem `for` | `placeholder-as-label` |
| todos | select sem nome, link só com ícone | `a11y-select-name`, `a11y-link-name` |
| todos | descrição com altura fixa, dropdown cortado pelo card | `content-clipping` `p.desc`, `div.card-menu` |
| todos | selo absoluto sobre o título | `text-overlap` `span.selo` |
| mobile/tablet | `overflow-x: hidden` no body escondendo badge/chips/coluna | `offscreen-element` |
| mobile/tablet | header fixo sem compensação cobrindo "Voltar" | `covered-element` `a.btn.voltar` |
| mobile/tablet | etiqueta tapando 36% do "Comprar" | `element-overlap` `button.btn.comprar` |
| mobile/tablet | texto legal 10px, paginação 32px | `small-text`, `touch-target-size` |
| desktop | toast fixo meio fora da tela | `offscreen-element` `div.toast` |
| desktop | barra promo fixa sobre o "Carrinho" | `covered-element` `button.btn.carrinho` |
| desktop | título nowrap invadindo a coluna vizinha | `text-overlap` `h1.hero-titulo` |
| desktop | link #aaa | `a11y-color-contrast` |

Controles na mesma página: skip link fora da tela, line-clamp, carrossel com
slides fora, drawer fechado, texto sobre imagem com fundo, `aria-label` em busca,
fonte de 12px, tooltip `visibility: hidden`.

## controls-page.html

Sem bugs: header e bottom nav fixos com padding no body, checkbox customizado
(input invisível + label), badge sobre ícone, tabela/lista roláveis, ellipsis,
line-clamp, avatar com `overflow: hidden`, grid auto-fill, ícone dentro do input,
legenda sobre imagem, imagem lazy fora da tela, modal/menu/tooltip fechados.
Qualquer finding aqui é falso positivo.
