/**
 * Overlap/Collision Analyzer
 * Detects overlapping elements.
 */

import { createFinding, SEVERITY } from '../findings/schema.js';
import { ensureDomHelpers } from './dom-helpers.js';

export async function analyzeOverlap(context) {
  const { page, route, viewport } = context;
  const findings = [];

  await ensureDomHelpers(page);
  const result = await page.evaluate(() => {
    const { getSelector, isInteractive, isRendered, isOnTopAt, isRevealableByScroll,
            isTextEntry, contentBox, intersect, isVisibleAt } = window.__jevUiAudit;
    const findings = [];
    const elements = Array.from(document.body.querySelectorAll('*')).filter(isRendered);

    // Check pairs for overlap (sampled for performance)
    const sampleSize = Math.min(elements.length, 200);
    const step = Math.max(1, Math.floor(elements.length / sampleSize));
    const sampled = elements.filter((_, i) => i % step === 0);

    for (let i = 0; i < sampled.length; i++) {
      const el1 = sampled[i];
      const rect1 = el1.getBoundingClientRect();

      if (rect1.width < 5 || rect1.height < 5) continue;

      for (let j = i + 1; j < sampled.length; j++) {
        const el2 = sampled[j];
        const rect2 = el2.getBoundingClientRect();

        if (rect2.width < 5 || rect2.height < 5) continue;

        // Ancestral/descendente sempre se sobrepõem: não é colisão
        if (el1.contains(el2) || el2.contains(el1)) continue;

        // Check intersection
        const overlapX = Math.max(0, Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left));
        const overlapY = Math.max(0, Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top));

        if (overlapX > 0 && overlapY > 0) {
          const area1 = rect1.width * rect1.height;
          const area2 = rect2.width * rect2.height;
          const overlapArea = overlapX * overlapY;

          // Skip small overlaps (< 10% of smaller element)
          if (overlapArea < Math.min(area1, area2) * 0.1) continue;

          // Check if interactive
          const isInteractive1 = isInteractive(el1);
          const isInteractive2 = isInteractive(el2);

          // Só é colisão se o interativo fica tapado no centro da interseção.
          // Ícones/labels decorativos com pointer-events:none não contam
          // (elementFromPoint os ignora), nem o interativo que está por cima.
          const cx = Math.max(rect1.left, rect2.left) + overlapX / 2;
          const cy = Math.max(rect1.top, rect2.top) + overlapY / 2;
          // Interativo cortado por ancestral com overflow nesse ponto não está
          // tapado, está cortado (o analyzer de clipping reporta o container)
          // O culpado tem que ser o outro elemento do par: se o ponto cai num
          // terceiro (header fixo, overlay), não é colisão deste par
          const hit = document.elementFromPoint(cx, cy);
          const obscured1 = isInteractive1 && isVisibleAt(el1, cx, cy) && !isOnTopAt(el1, cx, cy) &&
            hit !== null && el2.contains(hit) && !isRevealableByScroll(el1, el2);
          const obscured2 = isInteractive2 && isVisibleAt(el2, cx, cy) && !isOnTopAt(el2, cx, cy) &&
            hit !== null && el1.contains(hit) && !isRevealableByScroll(el2, el1);
          // Fração tapada do interativo: ícone dentro de input (~5%) é padrão,
          // botão sob overlay (~100%) é bug
          const coveredRatio = Math.max(
            obscured1 ? overlapArea / area1 : 0,
            obscured2 ? overlapArea / area2 : 0
          );
          // Campo de texto: o que importa não é a fração, é se o outro elemento
          // invade a área do texto digitado (ícone no padding é design; botão
          // sobre o texto, não)
          const intrudes = (field, other) => {
            if (!isTextEntry(field)) return null;
            const f = field.getBoundingClientRect();
            const o = other.getBoundingClientRect();
            // Adorno do tamanho de ícone inteiro dentro do campo (olho da senha,
            // limpar busca) é intencional: decide pela fração, como antes
            const adornment = o.width <= 32 && o.height <= 32 &&
              o.left >= f.left && o.right <= f.right && o.top >= f.top && o.bottom <= f.bottom;
            if (adornment) return null;
            const hit = intersect(contentBox(field), o);
            return Boolean(hit && hit.right - hit.left > 4 && hit.bottom - hit.top > 4);
          };
          const text1 = obscured1 ? intrudes(el1, el2) : null;
          const text2 = obscured2 ? intrudes(el2, el1) : null;
          const isBug = text1 === true || text2 === true ||
            (text1 === null && text2 === null && coveredRatio >= 0.15) ||
            (coveredRatio >= 0.15 && ((obscured1 && text1 === null) || (obscured2 && text2 === null)));

          if (isBug) {
            // element1 = o interativo tapado; element2 = quem está por cima
            const victimFirst = text1 === true || (text2 !== true && obscured1 &&
              (!obscured2 || overlapArea / area1 >= overlapArea / area2));
            findings.push({
              element1: {
                tag: el1.tagName.toLowerCase(),
                textPreview: el1.textContent?.slice(0, 30) || null,
                interactive: isInteractive1,
                selector: getSelector(el1)
              },
              element2: {
                tag: el2.tagName.toLowerCase(),
                textPreview: el2.textContent?.slice(0, 30) || null,
                interactive: isInteractive2,
                selector: getSelector(el2)
              },
              overlapX,
              overlapY,
              overlapArea,
              coveredRatio: Math.round(coveredRatio * 100) / 100
            });
            if (!victimFirst) {
              const last = findings[findings.length - 1];
              [last.element1, last.element2] = [last.element2, last.element1];
            }
          }
        }
      }
    }

    return findings.slice(0, 10); // Limit to top findings
  });

  for (const item of result) {
    findings.push(createFinding({
      rule: 'element-overlap',
      severity: item.element1.interactive || item.element2.interactive
        ? SEVERITY.HIGH
        : SEVERITY.MEDIUM,
      confidence: 0.8,
      route,
      viewport,
      element: item.element1,
      message: `${item.element1.selector} tapado ${Math.round(item.coveredRatio * 100)}% por ${item.element2.selector}`,
      metrics: {
        overlapX: item.overlapX,
        overlapY: item.overlapY,
        overlapArea: item.overlapArea,
        coveredRatio: item.coveredRatio,
        coveredBy: item.element2.selector
      }
    }));
  }

  return findings;
}

export default analyzeOverlap;
