/**
 * Horizontal Overflow Analyzer
 * Detects when page content exceeds viewport width.
 */

import { createFinding, SEVERITY } from '../findings/schema.js';
import { ensureDomHelpers } from './dom-helpers.js';

export async function analyzeOverflow(context) {
  const { page, route, viewport } = context;
  const findings = [];

  await ensureDomHelpers(page);
  const result = await page.evaluate((vp) => {
    const { getSelector, isRendered, clipRect, visibleTextRects } = window.__jevUiAudit;
    const docEl = document.documentElement;
    const scrollWidth = docEl.scrollWidth;
    const clientWidth = docEl.clientWidth;
    const overflowX = scrollWidth - clientWidth;

    if (overflowX <= 0) {
      return { hasOverflow: false };
    }

    // Causa provável: o primeiro elemento (ordem do DOM) que passa da borda
    // DEPOIS do corte dos ancestrais. Filho de container rolável/hidden não
    // estoura a página, mesmo que sua caixa passe do viewport.
    let rootElement = null;
    for (const el of document.body.querySelectorAll('*')) {
      if (!isRendered(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const boxOut = rect.right > clientWidth && clipRect(el).right > clientWidth;
      // Texto que vaza da própria caixa (white-space: pre/nowrap) também estoura
      const textOut = !boxOut && visibleTextRects(el).some(r => r.right > clientWidth + 1);
      if (!boxOut && !textOut) continue;
      rootElement = el;
      break;
    }

    // Raiz com largura ditada pelo conteúdo (fieldset tem min-width:
    // min-content; inline-block/table encolhem e crescem com os filhos) só
    // estoura porque algum descendente força. Desce pela cadeia de filhos que
    // estouram enquanto eles apenas preenchem o pai, até quem tem largura própria.
    const CONTENT_SIZED = /^(inline-block|inline-flex|inline-grid|table|inline-table|table-cell)$/;
    const contentSized = el => {
      const s = window.getComputedStyle(el);
      return s.minWidth === 'min-content' || CONTENT_SIZED.test(s.display);
    };
    const contentWidth = el => {
      const s = window.getComputedStyle(el);
      return el.clientWidth - (parseFloat(s.paddingLeft) || 0) - (parseFloat(s.paddingRight) || 0);
    };
    let follow = rootElement && contentSized(rootElement);
    while (follow) {
      const kids = Array.from(rootElement.children).filter(k =>
        isRendered(k) && k.getBoundingClientRect().right > clientWidth && clipRect(k).right > clientWidth);
      if (kids.length === 0) break;
      const parentWidth = contentWidth(rootElement);
      rootElement = kids.reduce((a, b) =>
        b.getBoundingClientRect().right > a.getBoundingClientRect().right ? b : a);
      follow = contentSized(rootElement) ||
        Math.abs(rootElement.getBoundingClientRect().width - parentWidth) < 1;
    }

    return {
      hasOverflow: true,
      overflowPx: overflowX,
      scrollWidth,
      clientWidth,
      rootElement: rootElement ? {
        tag: rootElement.tagName.toLowerCase(),
        id: rootElement.id || null,
        className: rootElement.className || null,
        textPreview: rootElement.textContent?.slice(0, 50) || null,
        selector: getSelector(rootElement)
      } : null
    };
  }, viewport);

  if (result.hasOverflow) {
    findings.push(createFinding({
      rule: 'horizontal-overflow',
      severity: result.overflowPx > 50 ? SEVERITY.CRITICAL : SEVERITY.HIGH,
      confidence: 0.95,
      route,
      viewport,
      element: result.rootElement,
      message: `Page exceeds viewport by ${result.overflowPx}px`,
      metrics: {
        viewportWidth: result.clientWidth,
        pageScrollWidth: result.scrollWidth,
        overflowPx: result.overflowPx
      }
    }));
  }

  return findings;
}

export default analyzeOverflow;
