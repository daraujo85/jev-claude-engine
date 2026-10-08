/**
 * Small Text Analyzer
 * Detecta texto renderizado abaixo de 12px, ilegível principalmente no celular.
 * Reporta o elemento dono do texto (nó de texto direto), não os ancestrais.
 */

import { createFinding, SEVERITY } from '../findings/schema.js';
import { ensureDomHelpers } from './dom-helpers.js';

const MIN_FONT_PX = 12;

export async function analyzeSmallText(context) {
  const { page, route, viewport } = context;
  const findings = [];

  await ensureDomHelpers(page);
  const result = await page.evaluate((minPx) => {
    const { getSelector, isRendered, isNonVisual, isVisuallyHidden, directTextRects } = window.__jevUiAudit;
    const items = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (isNonVisual(el) || !isRendered(el) || isVisuallyHidden(el)) continue;
      if (!directTextRects(el).length) continue;
      const fontPx = parseFloat(window.getComputedStyle(el).fontSize);
      if (!(fontPx < minPx)) continue;
      items.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        textPreview: el.textContent.trim().slice(0, 30),
        selector: getSelector(el),
        fontPx
      });
    }
    return items.slice(0, 15);
  }, MIN_FONT_PX);

  for (const item of result) {
    findings.push(createFinding({
      rule: 'small-text',
      category: 'responsive',
      severity: viewport?.touch ? SEVERITY.MEDIUM : SEVERITY.LOW,
      confidence: 0.9,
      route,
      viewport,
      element: { tag: item.tag, id: item.id, textPreview: item.textPreview, selector: item.selector },
      message: `Texto com ${item.fontPx}px (mínimo ${MIN_FONT_PX}px)`,
      metrics: { fontPx: item.fontPx, minFontPx: MIN_FONT_PX }
    }));
  }

  return findings;
}

export default analyzeSmallText;
