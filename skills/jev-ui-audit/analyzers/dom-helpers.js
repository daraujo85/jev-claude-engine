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
      const classes = el.className.trim().split(/\s+/).slice(0, 2);
      if (classes[0]) {
        return `${el.tagName.toLowerCase()}.${classes[0]}`;
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

  window.__jevUiAudit = { getSelector, isInteractive, isRendered, isNonVisual, isOnTopAt };
}

export async function ensureDomHelpers(page) {
  await page.evaluate(installDomHelpers);
}

export default ensureDomHelpers;
