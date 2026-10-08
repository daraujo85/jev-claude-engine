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
| covered-element | high | `.covered-button` sob `.floating-overlay` |
| element-overlap | high | `.covered-button` × `.floating-overlay` |
| touch-target-size | low | `.small-touch-target` (< 44px) |
| a11y-image-alt | critical | `img` sem `alt` |
| a11y-color-contrast | high | botões com texto branco em fundo claro |
