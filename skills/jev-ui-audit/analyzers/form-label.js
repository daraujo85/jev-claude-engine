/**
 * Form Label Analyzer
 * Campo cujo único rótulo acessível é o placeholder: o axe aceita (placeholder
 * conta como nome acessível), mas o texto some ao digitar, tem contraste baixo
 * por padrão e não é lido por todo leitor de tela (WCAG 1.3.1 / 3.3.2).
 * Quando há um <label> visual por perto mas sem for/id, o finding diz isso: a
 * correção é só associar, não criar um rótulo.
 */

import { createFinding, SEVERITY } from '../findings/schema.js';
import { ensureDomHelpers } from './dom-helpers.js';

const NON_TEXT_INPUTS = ['hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'range', 'color', 'file'];

export async function analyzeFormLabels(context) {
  const { page, route, viewport } = context;
  const findings = [];

  await ensureDomHelpers(page);
  const result = await page.evaluate((nonText) => {
    const { getSelector, isRendered } = window.__jevUiAudit;
    const items = [];
    for (const el of document.querySelectorAll('input[placeholder], textarea[placeholder]')) {
      if (el.tagName === 'INPUT' && nonText.includes((el.getAttribute('type') || 'text').toLowerCase())) continue;
      if (!isRendered(el) || !el.getAttribute('placeholder').trim()) continue;
      const hasLabel = (el.labels && el.labels.length > 0) ||
        el.getAttribute('aria-label')?.trim() ||
        el.getAttribute('aria-labelledby')?.trim() ||
        el.getAttribute('title')?.trim();
      if (hasLabel) continue;
      // <label> sem for no mesmo grupo (subindo até 3 níveis), sem outro campo no meio
      let orphanLabel = null;
      for (let p = el.parentElement, depth = 0; p && depth < 3 && !orphanLabel; p = p.parentElement, depth++) {
        if (p.querySelectorAll('input:not([type=hidden]), textarea, select').length > 1) break;
        const label = Array.from(p.querySelectorAll('label')).find(l => !l.control && l.textContent.trim());
        if (label) orphanLabel = label.textContent.trim().slice(0, 40);
      }
      items.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        textPreview: el.getAttribute('placeholder').slice(0, 30),
        selector: getSelector(el),
        orphanLabel
      });
    }
    return items.slice(0, 15);
  }, NON_TEXT_INPUTS);

  for (const item of result) {
    findings.push(createFinding({
      rule: 'placeholder-as-label',
      category: 'accessibility',
      severity: SEVERITY.MEDIUM,
      confidence: 0.9,
      route,
      viewport,
      element: { tag: item.tag, id: item.id, textPreview: item.textPreview, selector: item.selector },
      message: item.orphanLabel
        ? `<label> "${item.orphanLabel}" não está associado ao campo (falta for/id): o nome acessível vira o placeholder`
        : `Campo sem <label>: só o placeholder "${item.textPreview}" identifica o que digitar`,
      metrics: { placeholder: item.textPreview, orphanLabel: item.orphanLabel }
    }));
  }

  return findings;
}

export default analyzeFormLabels;
