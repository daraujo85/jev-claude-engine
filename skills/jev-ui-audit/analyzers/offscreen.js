/**
 * Offscreen Analyzer
 * Detecta conteúdo cortado pela borda lateral do viewport sem que a página role
 * até ele: o clássico `overflow-x: hidden` no body escondendo o estouro, ou um
 * elemento fixed posicionado parcialmente fora da tela.
 * Elementos INTEIROS fora da tela são ignorados: skip link e menu off-canvas
 * fechado são padrões intencionais.
 */

import { createFinding, SEVERITY } from '../findings/schema.js';
import { ensureDomHelpers } from './dom-helpers.js';

export async function analyzeOffscreen(context) {
  const { page, route, viewport } = context;
  const findings = [];

  await ensureDomHelpers(page);
  const result = await page.evaluate(() => {
    const { getSelector, isRendered, isNonVisual, isVisuallyHidden, isInteractive,
            hasDirectText, hasOpaqueBackground, clipRect, isFixed } = window.__jevUiAudit;
    const vw = document.documentElement.clientWidth;
    const html = document.documentElement;
    const clipped = s => ['hidden', 'clip'].includes(s.overflowX);
    // Se a página rola na horizontal, o horizontal-overflow já reporta o estouro
    const pageScrollsX = html.scrollWidth > html.clientWidth &&
      !clipped(window.getComputedStyle(html)) && !clipped(window.getComputedStyle(document.body));

    const VISUAL = new Set(['img', 'svg', 'video', 'canvas', 'iframe', 'picture']);
    const reported = [];
    const items = [];

    for (const el of document.body.querySelectorAll('*')) {
      if (isNonVisual(el) || !isRendered(el)) continue;
      if (reported.some(r => r.contains(el))) continue;
      const fixed = isFixed(el);
      if (pageScrollsX && !fixed) continue;

      const hasContent = hasDirectText(el) || VISUAL.has(el.tagName.toLowerCase()) ||
                         isInteractive(el) || hasOpaqueBackground(el);
      if (!hasContent || isVisuallyHidden(el)) continue;

      const box = clipRect(el);
      const width = box.right - box.left;
      if (width < 5 || box.bottom - box.top < 5) continue;
      const hiddenLeft = Math.max(0, -box.left);
      const hiddenRight = Math.max(0, box.right - vw);
      const hidden = Math.min(width, hiddenLeft + hiddenRight);
      // inteiro fora (intencional) ou só uma borda encostando
      if (hidden < 2 || hidden >= width - 1) continue;

      reported.push(el);
      items.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        textPreview: el.textContent?.trim().slice(0, 30) || null,
        selector: getSelector(el),
        hiddenPx: Math.round(hidden),
        hiddenRatio: Math.round((hidden / width) * 100) / 100,
        side: hiddenRight >= hiddenLeft ? 'right' : 'left',
        fixed
      });
    }
    return items.slice(0, 15);
  });

  for (const item of result) {
    findings.push(createFinding({
      rule: 'offscreen-element',
      category: 'responsive',
      severity: item.hiddenRatio >= 0.25 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
      confidence: 0.85,
      route,
      viewport,
      element: { tag: item.tag, id: item.id, textPreview: item.textPreview, selector: item.selector },
      message: `${item.selector} tem ${item.hiddenPx}px (${Math.round(item.hiddenRatio * 100)}%) fora da tela à ${item.side === 'right' ? 'direita' : 'esquerda'}, sem rolagem para alcançar`,
      metrics: { hiddenPx: item.hiddenPx, hiddenRatio: item.hiddenRatio, side: item.side, fixed: item.fixed }
    }));
  }

  return findings;
}

export default analyzeOffscreen;
