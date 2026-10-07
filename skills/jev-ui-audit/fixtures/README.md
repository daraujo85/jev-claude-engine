# UI Audit Test Fixtures

Fixtures for testing jev-ui-audit detection rules.

## Running Tests

1. Start a local server:
```bash
npx serve .
```

2. Run audit:
```bash
jev ui-audit http://localhost:3000/test-page.html --viewports mobile
```

## Expected Findings

| Rule | Expected Severity |
|------|------------------|
| horizontal-overflow | critical |
| content-clipping | medium |
| collapsed-element | medium |
| element-overlap | high |
| a11y-image-alt | medium |
| touch-target-size | medium |
