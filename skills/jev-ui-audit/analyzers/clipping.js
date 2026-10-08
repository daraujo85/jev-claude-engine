/**
 * Clipping Analyzer
 * Detects when child content exceeds a parent with overflow clipping.
 */

import { createFinding, SEVERITY } from '../findings/schema.js';
import { ensureDomHelpers } from './dom-helpers.js';

export async function analyzeClipping(context) {
  const { page, route, viewport } = context;
  const findings = [];

  await ensureDomHelpers(page);
  const result = await page.evaluate(() => {
    const { getSelector, directTextRects } = window.__jevUiAudit;
    const findings = [];

    // Há conteúdo real escondido? Na vertical, qualquer coisa além da borda
    // conta (itens de nav sumindo, texto cortado). Na horizontal, elemento
    // inteiro do lado de fora é paginação de carrossel/slider: só conta texto
    // próprio fora da caixa ou algo atravessando a borda (cortado ao meio).
    function outside(box, r, axis) {
      return axis === 'x'
        ? r.left < box.left - 1 || r.right > box.right + 1
        : r.top < box.top - 1 || r.bottom > box.bottom + 1;
    }
    function straddles(box, r) {
      return (r.left < box.left - 1 && r.right > box.left + 1) || (r.left < box.right - 1 && r.right > box.right + 1);
    }
    // Lista o que ficou cortado (vazia = nada real escondido). Guarda só o
    // elemento mais externo de cada trecho, com texto, pra evidência legível.
    function cutContent(container, axis) {
      const box = container.getBoundingClientRect();
      const cut = [];
      if (directTextRects(container).some(r => outside(box, r, axis))) cut.push(container);
      for (const d of container.querySelectorAll('*')) {
        const r = d.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if ((axis === 'y' ? outside(box, r, 'y') : straddles(box, r)) ||
            (axis === 'x' && directTextRects(d).some(t => straddles(box, t)))) {
          if (!cut.some(c => c !== container && c.contains(d))) cut.push(d);
        }
      }
      return cut;
    }
    function describe(els) {
      return els.map(e => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)
        || e.getAttribute('aria-label') || e.getAttribute('href') || e.tagName.toLowerCase())
        .filter((t, i, a) => a.indexOf(t) === i).slice(0, 5);
    }

    for (const el of document.body.querySelectorAll('*')) {
      const style = window.getComputedStyle(el);

      const overflowX = style.overflowX;
      const overflowY = style.overflowY;
      const clipsX = ['hidden', 'clip'].includes(overflowX);
      const clipsY = ['hidden', 'clip'].includes(overflowY);

      // auto/scroll são containers roláveis intencionais, não clipping
      if (!clipsX && !clipsY) continue;

      // Caixa <= 1px: padrão sr-only/visually-hidden ou elemento colapsado
      // (este o analyzer de visibility já reporta como collapsed-element)
      if (el.clientWidth <= 1 || el.clientHeight <= 1) continue;

      // Truncamento intencional: ellipsis corta na horizontal, line-clamp na vertical
      const ellipsis = style.textOverflow === 'ellipsis';
      const clamp = (style.webkitLineClamp && style.webkitLineClamp !== 'none') ||
                    (style.lineClamp && style.lineClamp !== 'none');

      const cutX = clipsX && !ellipsis && el.scrollWidth > el.clientWidth + 1 ? cutContent(el, 'x') : [];
      const cutY = clipsY && !clamp && el.scrollHeight > el.clientHeight + 1 ? cutContent(el, 'y') : [];
      if (!cutX.length && !cutY.length) continue;
      const cut = [...cutX, ...cutY.filter(e => !cutX.includes(e))];

      findings.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        textPreview: el.textContent?.trim().slice(0, 30) || null,
        overflowX,
        overflowY,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        selector: getSelector(el),
        cutCount: cut.length,
        cutItems: describe(cut)
      });
    }

    return findings.slice(0, 20); // Limit findings
  });

  for (const item of result) {
    const overflowPx = Math.max(
      item.scrollWidth - item.clientWidth,
      item.scrollHeight - item.clientHeight
    );

    findings.push(createFinding({
      rule: 'content-clipping',
      severity: overflowPx > 20 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
      confidence: 0.85,
      route,
      viewport,
      element: {
        tag: item.tag,
        id: item.id,
        textPreview: item.textPreview,
        selector: item.selector
      },
      // overflow hidden não rola com mouse nem toque: o que está fora só aparece
      // se algum script mexer no scrollTop (ou via foco de teclado)
      message: `Conteúdo cortado por overflow ${item.overflowX}/${item.overflowY}: ` +
        `${item.cutCount} elemento(s) fora da caixa sem rolagem (${item.cutItems.join(', ')})`,
      metrics: {
        overflowX: item.overflowX,
        overflowY: item.overflowY,
        scrollWidth: item.scrollWidth,
        clientWidth: item.clientWidth,
        scrollHeight: item.scrollHeight,
        clientHeight: item.clientHeight
      },
      evidence: { cutCount: item.cutCount, cutItems: item.cutItems }
    }));
  }

  return findings;
}

export default analyzeClipping;
