/**
 * Visibility Analyzer
 * Detects invisible, hidden, or off-screen elements.
 */

import { createFinding, SEVERITY } from '../findings/schema.js';
import { ensureDomHelpers } from './dom-helpers.js';

export async function analyzeVisibility(context) {
  const { page, route, viewport } = context;
  const findings = [];

  await ensureDomHelpers(page);
  const result = await page.evaluate((vp) => {
    const { getSelector, isInteractive, isNonVisual, isRevealableByScroll } = window.__jevUiAudit;
    const findings = [];
    const elements = Array.from(document.body.querySelectorAll('*'));

    for (const el of elements) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      if (isNonVisual(el)) continue;

      // Skip hidden elements
      if (style.display === 'none' || style.display === 'contents' || style.visibility === 'hidden') {
        continue; // Expected behavior
      }

      // Zero-size rendered elements que têm conteúdo (antes do filtro de tamanho,
      // senão nunca dispara). Reporta só o topo: filho de colapsado é ruído.
      if (rect.width === 0 || rect.height === 0) {
        const parentRect = el.parentElement?.getBoundingClientRect();
        const parentCollapsed = parentRect && (parentRect.width === 0 || parentRect.height === 0);
        if (!parentCollapsed && el.textContent?.trim()) {
          findings.push({
            type: 'zero-size',
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            textPreview: el.textContent.trim().slice(0, 30),
            selector: getSelector(el),
            style: { display: style.display, visibility: style.visibility, width: rect.width, height: rect.height }
          });
        }
        continue;
      }

      // Skip tiny elements
      if (rect.width < 5 || rect.height < 5) continue;

      // Check if element is rendered off-screen
      const isOffScreen = rect.right < 0 || rect.bottom < 0 ||
                          rect.left > vp.width || rect.top > vp.height;

      // elementFromPoint só enxerga o viewport atual
      if (isOffScreen) continue;

      // Check if covered by other elements (z-index check). Acertar um
      // descendente do próprio elemento não é cobertura.
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      );
      const isCovered = hit !== null && hit !== el && !el.contains(hit) && !isRevealableByScroll(el, hit);

      // Cobertura só importa para o que o usuário precisa clicar
      if (isCovered && isInteractive(el) && style.pointerEvents !== 'none') {
        findings.push({
          type: 'covered',
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          textPreview: el.textContent?.slice(0, 30) || null,
          selector: getSelector(el),
          coveredBy: getSelector(hit),
          position: style.position,
          zIndex: style.zIndex
        });
      }
    }

    return findings.slice(0, 15);
  }, viewport);

  for (const item of result) {
    findings.push(createFinding({
      rule: item.type === 'zero-size' ? 'collapsed-element' : 'covered-element',
      severity: item.type === 'covered' ? SEVERITY.HIGH : SEVERITY.MEDIUM,
      confidence: 0.8,
      route,
      viewport,
      element: {
        tag: item.tag,
        id: item.id,
        textPreview: item.textPreview,
        selector: item.selector
      },
      message: item.type === 'zero-size'
        ? `Element has zero dimensions but is rendered`
        : `Element may be covered by another element`,
      metrics: item.style || { coveredBy: item.coveredBy, position: item.position, zIndex: item.zIndex }
    }));
  }

  return findings;
}

export default analyzeVisibility;
