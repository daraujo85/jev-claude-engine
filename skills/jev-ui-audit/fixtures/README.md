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

## holdout-page.html

Escrita depois do ajuste dos analyzers, com o gabarito fechado antes da primeira
execução. Na primeira rodada às cegas deu recall 81,6% e precisão 81,6%. As
correções vieram dos casos que falharam: conteúdo de `<details>` fechado, raiz do
overflow dentro de container rolável e botão inalcançável sob banner fixo.
Bugs: rótulo de botão cortado, preço com margem negativa sobre outro, texto de
11px, painel com altura 0, banner de cookies sem espaço reservado tapando o último
botão e o FAB, imagem estourando só no mobile, anúncio cobrindo o "Assinar" no
tablet/desktop, `<picture>` 404, link-imagem sem nome, textarea só com placeholder,
checkbox 13px, link focável dentro de `aria-hidden` e iframe sem título.
Controles: header sticky, chips roláveis, input file escondido com label, `<dialog>`
e `<details>` fechados, `[hidden]`.

## spa-shell-page.html

App shell: o documento não rola, quem rola é o `.conteudo`. O botão do fim da lista
é alcançável rolando o container (controle). O "Concluir" fica preso sob um toast
absoluto em qualquer scroll, e o rótulo do campo de valor é cortado (bugs).

## holdout2-page.html (às cegas, rodada 2)

Checkout. Bugs: linha CEP/número estoura a página no mobile (a raiz é o `div` de
200px, não o `fieldset`, que só cresce junto por `min-width: min-content`), botão
"Aplicar" com margem negativa sobre o texto do campo de cupom, aviso com contraste
baixo, radios de parcelas cortados por `overflow: hidden`.
Ajustes que esta rodada provocou: radio cortado por ancestral é clipping, não
cobertura (`isVisibleAt`); em campo de texto vale a invasão da área do texto
digitado (`contentBox`) e não a fração tapada; a raiz do overflow desce por
elementos com largura ditada pelo conteúdo. O radio 24px dentro de label de 48px
não é alvo pequeno (o gabarito estava errado).

## holdout3-page.html (às cegas, rodada 3)

Painel admin. Bugs: legenda de 11px, botão de 32px, card com lista cortada, status
sobre o título, `<img>` de avatar 404, filtro só com placeholder, botão-ícone sem
nome, imagem sem alt, `<pre>` de log estourando no mobile (o texto vaza da caixa,
não a caixa), barra fixa tapando o último botão no mobile, anúncio cobrindo o
"Salvar" no desktop, botão de menu sem `min-height` no mobile/tablet.
Controles: ícone no padding da busca, off-canvas, tabela rolável, ellipsis, toggle
customizado, modal fechado.
Ajuste: a raiz do overflow considera texto que vaza da própria caixa.
O gabarito errou só o botão "☰" (a skill acertou).
