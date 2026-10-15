/**
 * Text Overlap Analyzer
 * Detecta texto desenhado por cima de outro texto (ilegível): título nowrap
 * invadindo a coluna vizinha, selo absoluto sobre o título etc.
 * Texto escondido sob um elemento de fundo opaco (header fixo) é oclusão, não
 * sobreposição: fica para o covered-element.
 */

import { createFinding, SEVERITY } from '../findings/schema.js';
import { ensureDomHelpers } from './dom-helpers.js';

export async function analyzeTextOverlap(context) {
  const { page, route, viewport } = context;
  const findings = [];

  await ensureDomHelpers(page);
  const result = await page.evaluate(() => {
    const { getSelector, isRendered, isVisuallyHidden, visibleTextRects,
            intersect, hasOpaqueBackground } = window.__jevUiAudit;

    const blocks = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!isRendered(el) || isVisuallyHidden(el)) continue;
      const rects = visibleTextRects(el);
      if (!rects.length) continue;
      const own = el.getBoundingClientRect();
      const spills = rects.some(r => r.right > own.right + 1 || r.bottom > own.bottom + 1 ||
                                     r.left < own.left - 1 || r.top < own.top - 1);
      blocks.push({ el, rects, spills });
      if (blocks.length >= 400) break;
    }

    // Algum fundo opaco entre o texto de cima e o de baixo esconde o de baixo
    function occludes(topEl, bottomEl, area) {
      for (let p = topEl; p && p !== document.body; p = p.parentElement) {
        if (p.contains(bottomEl)) return false;
        if (!hasOpaqueBackground(p)) continue;
        const r = p.getBoundingClientRect();
        if (r.left <= area.left && r.right >= area.right && r.top <= area.top && r.bottom >= area.bottom) return true;
      }
      return false;
    }

    const items = [];
    const seen = new Set();
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i];
        const b = blocks[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        let area = null;
        for (const ra of a.rects) {
          for (const rb of b.rects) {
            const x = intersect(ra, rb);
            // 2px de tolerância: line-height apertado encosta linhas vizinhas
            if (x && x.right - x.left > 2 && x.bottom - x.top > 2) { area = x; break; }
          }
          if (area) break;
        }
        if (!area) continue;

        const hit = document.elementFromPoint((area.left + area.right) / 2, (area.top + area.bottom) / 2);
        const aOnTop = hit && (a.el === hit || a.el.contains(hit));
        const bOnTop = hit && (b.el === hit || b.el.contains(hit));
        const top = aOnTop ? a : bOnTop ? b : null;
        const bottom = top === a ? b : a;
        if (top && occludes(top.el, bottom.el, area)) continue;

        // Culpado: o texto que vaza da própria caixa; senão, o que está por cima
        const culprit = a.spills !== b.spills ? (a.spills ? a : b) : (top || b);
        const other = culprit === a ? b : a;
        const selector = getSelector(culprit.el);
        if (seen.has(selector)) continue;
        seen.add(selector);
        items.push({
          tag: culprit.el.tagName.toLowerCase(),
          id: culprit.el.id || null,
          textPreview: culprit.el.textContent?.trim().slice(0, 30) || null,
          selector,
          overlaps: getSelector(other.el),
          overlapPx: Math.round((area.right - area.left) * (area.bottom - area.top))
        });
      }
    }
    return items.slice(0, 10);
  });

  for (const item of result) {
    findings.push(createFinding({
      rule: 'text-overlap',
      severity: SEVERITY.HIGH,
      confidence: 0.85,
      route,
      viewport,
      element: { tag: item.tag, id: item.id, textPreview: item.textPreview, selector: item.selector },
      message: `Texto de ${item.selector} desenhado sobre o texto de ${item.overlaps}`,
      metrics: { overlaps: item.overlaps, overlapPx: item.overlapPx }
    }));
  }

  return findings;
}

export default analyzeTextOverlap;
