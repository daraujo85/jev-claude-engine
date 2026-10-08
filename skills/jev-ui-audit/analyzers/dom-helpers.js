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
    return style.display !== 'none' && style.visibility !== 'hidden';
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

  // Barra fixa encostada no topo/rodapé e ocupando a largura (header, bottom
  // nav) só esconde o que está embaixo NESTA posição de scroll. Se a página
  // reserva espaço para ela (padding no body), rolar revela o elemento: não é
  // bug. Painéis/widgets flutuantes não entram aqui, cobrem uma coluna inteira.
  function isRevealableByScroll(victim, coverer) {
    if (isFixed(victim)) return false;
    let bar = null;
    for (let p = coverer; p && p !== document.documentElement; p = p.parentElement) {
      if (window.getComputedStyle(p).position === 'fixed') { bar = p; break; }
    }
    if (!bar) return false;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const b = bar.getBoundingClientRect();
    if (b.width < vw * 0.9) return false;
    const v = victim.getBoundingClientRect();
    const scrollY = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - vh;
    const absTop = v.top + scrollY;
    const absBottom = v.bottom + scrollY;
    if (b.top <= 1) return absTop >= b.bottom;                       // barra no topo: nunca sobe além dela
    if (b.bottom >= vh - 1) return absBottom - b.top <= maxScroll;   // barra no rodapé: rolar até sair de baixo
    return false;
  }

  // Área de toque real: o <label> associado também aciona o campo (WCAG 2.5.8)
  function touchRect(el) {
    const r = el.getBoundingClientRect();
    let width = r.width;
    let height = r.height;
    for (const label of el.labels || []) {
      const lr = label.getBoundingClientRect();
      if (lr.width * lr.height > width * height) { width = lr.width; height = lr.height; }
    }
    return { width, height };
  }

  window.__jevUiAudit = {
    isRevealableByScroll, touchRect,
    getSelector, isInteractive, isRendered, isNonVisual, isOnTopAt,
    isVisuallyHidden, hasDirectText, directTextRects, visibleTextRects, clipBox, clipRect, intersect, hasOpaqueBackground, isFixed
  };
}

export async function ensureDomHelpers(page) {
  await page.evaluate(installDomHelpers);
}

export default ensureDomHelpers;
