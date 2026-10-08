/**
 * Accessibility Analyzer
 * Uses axe-core to detect accessibility violations.
 */

import { createFinding, normalizeSeverity } from '../findings/schema.js';
import axe from 'axe-core';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export async function analyzeAccessibility(context) {
  const { page, route, viewport } = context;
  const findings = [];

  // Inject axe-core into page (addScriptTag passa por CSP melhor que textContent)
  const hasAxe = await page.evaluate(() => Boolean(window.axe));
  if (!hasAxe) {
    await page.addScriptTag({ content: axe.source });
  }

  // Erros sobem para o runAnalyzers: a11y ausente não pode virar "0 violações"
  const result = await page.evaluate((tags) => {
    if (!window.axe) throw new Error('axe-core não foi injetado na página');
    return window.axe.run(document, { runOnly: { type: 'tag', values: tags } })
      .then(r => ({
        violations: r.violations.map(v => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          tags: v.tags,
          nodes: v.nodes.slice(0, 5).map(n => ({ target: n.target, html: n.html }))
        }))
      }));
  }, WCAG_TAGS);

  for (const violation of result.violations) {
    const node = violation.nodes[0];
    findings.push(createFinding({
      rule: `a11y-${violation.id}`,
      category: 'accessibility',
      severity: normalizeSeverity(violation.impact),
      confidence: 0.9,
      route,
      viewport,
      element: node ? {
        selector: Array.isArray(node.target) ? node.target.join(' ') : String(node.target),
        html: node.html?.slice(0, 100)
      } : null,
      message: `${violation.help} (${violation.nodes.length} elemento(s))`,
      metrics: {
        wcagCriteria: violation.helpUrl,
        impact: violation.impact,
        tags: violation.tags,
        targets: violation.nodes.map(n => n.target)
      }
    }));
  }

  return findings;
}

export default analyzeAccessibility;
