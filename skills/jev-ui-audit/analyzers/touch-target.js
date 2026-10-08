/**
 * Touch Target Analyzer
 * Detects interactive elements smaller than the minimum touch size
 * (WCAG 2.5.8 AA = 24px; recomendação de plataforma = 44px).
 * Só roda em viewports touch.
 */

import { createFinding, SEVERITY } from '../findings/schema.js';
import { ensureDomHelpers } from './dom-helpers.js';

const MIN_AA = 24;
const RECOMMENDED = 44;

export async function analyzeTouchTargets(context) {
  const { page, route, viewport } = context;
  const findings = [];

  if (!viewport?.touch) return findings;

  await ensureDomHelpers(page);
  const result = await page.evaluate(({ recommended }) => {
    const { getSelector, isInteractive, isRendered, touchRect } = window.__jevUiAudit;
    const items = [];

    for (const el of document.body.querySelectorAll('*')) {
      if (!isInteractive(el) || !isRendered(el)) continue;
      // Links dentro de texto corrido são exceção no WCAG 2.5.8
      if (el.tagName === 'A' && window.getComputedStyle(el).display === 'inline') continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      // Fora da tela (skip link, menu off-canvas fechado): não é tocável agora
      if (box.right <= 0 || box.left >= window.innerWidth) continue;
      const rect = touchRect(el);
      if (rect.width >= recommended && rect.height >= recommended) continue;

      items.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        textPreview: el.textContent?.trim().slice(0, 30) || null,
        selector: getSelector(el),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      });
    }

    return items.slice(0, 20);
  }, { recommended: RECOMMENDED });

  for (const item of result) {
    const belowAA = item.width < MIN_AA || item.height < MIN_AA;
    findings.push(createFinding({
      rule: 'touch-target-size',
      category: 'responsive',
      severity: belowAA ? SEVERITY.MEDIUM : SEVERITY.LOW,
      confidence: 0.85,
      route,
      viewport,
      element: {
        tag: item.tag,
        id: item.id,
        textPreview: item.textPreview,
        selector: item.selector
      },
      message: `Touch target ${item.width}x${item.height}px (mínimo ${belowAA ? MIN_AA : RECOMMENDED}px)`,
      metrics: { width: item.width, height: item.height, minAA: MIN_AA, recommended: RECOMMENDED }
    }));
  }

  return findings;
}

export default analyzeTouchTargets;
