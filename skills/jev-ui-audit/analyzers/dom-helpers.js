/**
 * DOM Helpers
 * Helpers que precisam rodar DENTRO do browser. Funções passadas a
 * page.evaluate são serializadas, então não enxergam nada do módulo Node:
 * os helpers são instalados uma vez em window.__jevUiAudit e os analyzers
 * os acessam por lá.
 */

function installDomHelpers() {
  if (window.__jevUiAudit) return;

  function getSelector(el) {
    if (el.id) return `#${el.id}`;
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (classes.length) {
        return `${el.tagName.toLowerCase()}.${classes.join('.')}`;
      }
    }
    return el.tagName.toLowerCase();
  }

  function isInteractive(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    return ['button', 'a', 'input', 'select', 'textarea'].includes(tag) ||
           ['button', 'link', 'checkbox', 'radio', 'menuitem'].includes(role) ||
           el.hasAttribute('onclick') ||
           el.hasAttribute('onchange');
  }

  function isRendered(el) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    // Conteúdo de <details> fechado, content-visibility: hidden etc.: o
    // computed style diz "block", mas nada é pintado
    if (el.checkVisibility && !el.checkVisibility({ contentVisibilityAuto: false })) return false;
    return true;
  }

  // Tags que nunca têm caixa visual própria
  const NON_VISUAL = new Set(['noscript', 'script', 'style', 'template', 'option', 'optgroup', 'br', 'wbr', 'datalist', 'title', 'meta', 'link']);
  function isNonVisual(el) {
    return NON_VISUAL.has(el.tagName.toLowerCase());
  }

  // true se o topo da pilha no ponto (x, y) é o próprio el ou um descendente
  function isOnTopAt(el, x, y) {
    const hit = document.elementFromPoint(x, y);
    return hit === null || hit === el || el.contains(hit);
  }

  // Padrão sr-only / visually-hidden: existe pro leitor de tela, não pro olho
  function isVisuallyHidden(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return true;
    const style = window.getComputedStyle(el);
    return style.opacity === '0' || /rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)/.test(style.clip);
  }

  // Texto próprio (nó de texto filho direto), não o herdado dos descendentes
  function hasDirectText(el) {
    return Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
  }

  function directTextRects(el) {
    const rects = [];
    for (const n of el.childNodes) {
      if (n.nodeType !== Node.TEXT_NODE || !n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width > 0 && r.height > 0) rects.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
      }
    }
    return rects;
  }

  // Recorta rect pelos containers com overflow != visible a partir de `from`
  // subindo a árvore. html/body ficam de fora: o corte deles é o próprio
  // viewport, que é o que os analyzers querem medir.
  function clipBox(rect, from) {
    const box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    for (let p = from; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const s = window.getComputedStyle(p);
      const clipX = s.overflowX !== 'visible';
      const clipY = s.overflowY !== 'visible';
      if (clipX || clipY) {
        const pr = p.getBoundingClientRect();
        if (clipX) { box.left = Math.max(box.left, pr.left); box.right = Math.min(box.right, pr.right); }
        if (clipY) { box.top = Math.max(box.top, pr.top); box.bottom = Math.min(box.bottom, pr.bottom); }
      }
      if (s.position === 'fixed') break;
    }
    return box;
  }

  // Parte visível da caixa do elemento (cortada pelos ancestrais)
  function clipRect(el) {
    return clipBox(el.getBoundingClientRect(), el.parentElement);
  }

  // Parte visível dos textos próprios (o próprio el também corta, se tiver overflow)
  function visibleTextRects(el) {
    return directTextRects(el)
      .map(r => intersect(r, clipBox(r, el)))
      .filter(Boolean);
  }

  function intersect(a, b) {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    return right > left && bottom > top ? { left, top, right, bottom } : null;
  }

  function hasOpaqueBackground(el) {
    const s = window.getComputedStyle(el);
    if (s.backgroundImage !== 'none') return true;
    const m = s.backgroundColor.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const parts = m[1].split(/[ ,/]+/).filter(Boolean);
    const alpha = parts.length > 3 ? parseFloat(parts[3]) : 1;
    return alpha >= 0.5;
  }

  // Algum ancestral posicionado fixed (ou o próprio el): rolar a página não o revela
  function isFixed(el) {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      if (window.getComputedStyle(p).position === 'fixed') return true;
    }
    return false;
  }

  // Elemento fixed (ou sticky) que fica sobre o conteúdo enquanto a página rola
  function stuckAncestor(el) {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const pos = window.getComputedStyle(p).position;
      if (pos === 'fixed' || pos === 'sticky') return p;
    }
    return null;
  }

  // Faixas verticais do viewport tapadas por fixed/sticky na coluna x
  // Lista de fixed/sticky, cacheada por 1s: scrollBlocker roda por elemento
  let stuckCache = null;
  function stuckElements() {
    if (stuckCache && performance.now() - stuckCache.at < 1000) return stuckCache.list;
    const list = Array.from(document.body.querySelectorAll('*')).filter(el => {
      const pos = window.getComputedStyle(el).position;
      return pos === 'fixed' || pos === 'sticky';
    });
    stuckCache = { at: performance.now(), list };
    return list;
  }

  function stuckBands(x, exclude) {
    const bands = [];
    for (const el of stuckElements()) {
      const pos = window.getComputedStyle(el).position;
      if (exclude && (el.contains(exclude) || exclude.contains(el))) continue;
      if (!isRendered(el) || window.getComputedStyle(el).pointerEvents === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 5 || r.height < 5 || x < r.left || x > r.right) continue;
      // sticky só gruda no topo/rodapé depois de rolar: usa a posição grudada
      if (pos === 'sticky') {
        const s = window.getComputedStyle(el);
        if (s.top !== 'auto') bands.push({ top: parseFloat(s.top), bottom: parseFloat(s.top) + r.height, el });
        else if (s.bottom !== 'auto') bands.push({ top: window.innerHeight - parseFloat(s.bottom) - r.height, bottom: window.innerHeight - parseFloat(s.bottom), el });
        continue;
      }
      bands.push({ top: r.top, bottom: r.bottom, el });
    }
    return bands;
  }

  // Existe alguma posição de scroll em que o centro do elemento fica dentro do
  // viewport e fora de toda barra fixa/sticky? Se não, ele é inalcançável
  // (ex.: último botão da página preso sob o banner de cookies).
  // Devolve null se alcançável, ou o elemento que o tapa.
  function scrollBlocker(victim) {
    if (stuckAncestor(victim)) return null;  // anda junto com o scroll
    // Dentro de container rolável (layout de SPA que rola um div, não o
    // documento): o scroll do documento não é o que revela o elemento
    for (let p = victim.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const s = window.getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) return null;
    }
    const r = victim.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const absCenter = r.top + r.height / 2 + window.scrollY;
    const vh = window.innerHeight;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
    const bands = stuckBands(cx, victim).sort((a, b) => a.top - b.top);
    // zonas livres = [0, vh] menos as faixas
    const free = [];
    let cursor = 0;
    for (const band of bands) {
      if (band.top > cursor) free.push([cursor, Math.min(band.top, vh)]);
      cursor = Math.max(cursor, band.bottom);
    }
    if (cursor < vh) free.push([cursor, vh]);
    for (const [z0, z1] of free) {
      if (z1 - z0 < 1) continue;
      // centro em z0..z1 => scrollY em [absCenter - z1, absCenter - z0]
      const lo = Math.max(0, absCenter - z1);
      const hi = Math.min(maxScroll, absCenter - z0);
      if (hi >= lo) return null;
    }
    // tapado em qualquer scroll: aponta a faixa onde o centro para no fim do scroll
    const y = Math.min(maxScroll, Math.max(0, absCenter - vh / 2));
    const at = absCenter - y;
    // Sem barra sobre o centro, o que impede é falta de scroll, não oclusão
    const band = bands.find(b => at >= b.top && at <= b.bottom);
    return band ? band.el : null;
  }

  // O coverer é fixed/sticky e rolar a página tira a vítima de baixo dele
  function isRevealableByScroll(victim, coverer) {
    if (!stuckAncestor(coverer) || stuckAncestor(victim)) return false;
    return scrollBlocker(victim) === null;
  }

  // Área de toque real: o <label> associado também aciona o campo (WCAG 2.5.8)
  // Área tocável: a caixa do elemento, o <label> associado ou o pseudo-elemento
  // absoluto que estica o clique sobre o card/linha ("stretched link":
  // a::after { position: absolute; inset: 0 } dentro de um container relative)
  function stretchedRect(el) {
    let best = null;
    for (const pseudo of ['::before', '::after']) {
      const ps = window.getComputedStyle(el, pseudo);
      if (ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') continue;
      if (ps.position !== 'absolute' || ps.pointerEvents === 'none') continue;
      const offs = ['top', 'right', 'bottom', 'left'].map(k => ps[k]);
      if (offs.some(v => !/^-?[\d.]+px$/.test(v))) continue;
      const [top, right, bottom, left] = offs.map(parseFloat);
      // Bloco de contenção: o próprio elemento se posicionado, senão o ancestral posicionado
      let cb = window.getComputedStyle(el).position !== 'static' ? el : el.parentElement;
      while (cb && cb !== document.body && window.getComputedStyle(cb).position === 'static') cb = cb.parentElement;
      if (!cb) continue;
      const c = cb.getBoundingClientRect();
      const rect = { width: c.width - left - right, height: c.height - top - bottom };
      if (rect.width > 0 && rect.height > 0 && (!best || rect.width * rect.height > best.width * best.height)) best = rect;
    }
    return best;
  }

  function touchRect(el) {
    const r = el.getBoundingClientRect();
    let width = r.width;
    let height = r.height;
    const candidates = [...(el.labels || [])].map(l => l.getBoundingClientRect());
    const stretched = stretchedRect(el);
    if (stretched) candidates.push(stretched);
    for (const c of candidates) {
      if (c.width * c.height > width * height) { width = c.width; height = c.height; }
    }
    return { width, height };
  }

  const TEXT_INPUT = /^(text|search|email|url|tel|password|number)$/;
  function isTextEntry(el) {
    if (el.tagName === 'TEXTAREA') return true;
    return el.tagName === 'INPUT' && TEXT_INPUT.test((el.getAttribute('type') || 'text').toLowerCase());
  }

  // Área onde o texto digitado aparece: a caixa menos borda e padding. Ícone
  // ou botão dentro do padding é padrão de design; dentro desta área, tapa o texto.
  function contentBox(el) {
    const r = el.getBoundingClientRect();
    const s = window.getComputedStyle(el);
    const px = v => parseFloat(v) || 0;
    return {
      left: r.left + px(s.borderLeftWidth) + px(s.paddingLeft),
      right: r.right - px(s.borderRightWidth) - px(s.paddingRight),
      top: r.top + px(s.borderTopWidth) + px(s.paddingTop),
      bottom: r.bottom - px(s.borderBottomWidth) - px(s.paddingBottom)
    };
  }

  // Ponto (x, y) está dentro da parte visível do el (não cortado por ancestral)
  function isVisibleAt(el, x, y) {
    const c = clipRect(el);
    return x >= c.left && x <= c.right && y >= c.top && y <= c.bottom;
  }

  window.__jevUiAudit = {
    isTextEntry, contentBox, isVisibleAt,
    isRevealableByScroll, scrollBlocker, stuckAncestor, touchRect,
    getSelector, isInteractive, isRendered, isNonVisual, isOnTopAt,
    isVisuallyHidden, hasDirectText, directTextRects, visibleTextRects, clipBox, clipRect, intersect, hasOpaqueBackground, isFixed
  };
}

export async function ensureDomHelpers(page) {
  await page.evaluate(installDomHelpers);
}

export default ensureDomHelpers;
