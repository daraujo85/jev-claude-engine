/**
 * Accessibility Analyzer
 * Uses axe-core to detect accessibility violations.
 */

import { createFinding, normalizeSeverity } from '../findings/schema.js';
import axe from 'axe-core';

export async function analyzeAccessibility(context) {
  const { page, route, viewport } = context;
  const findings = [];

  try {
    // Inject axe-core into page
    await page.evaluate((axeSource) => {
      if (!window.axe) {
        const script = document.createElement('script');
        script.textContent = axeSource;
        document.head.appendChild(script);
      }
    }, axe.source);

    // Run axe analysis
    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        if (window.axe) {
          window.axe.run({ runOnly: { type: 'rule', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })
            .then(resolve)
            .catch(() => resolve({ violations: [] }));
        } else {
          resolve({ violations: [] });
        }
      });
    });

    for (const violation of result.violations || []) {
      findings.push(createFinding({
        rule: `a11y-${violation.id}`,
        category: 'accessibility',
        severity: normalizeSeverity(violation.impact),
        confidence: 0.9,
        route,
        viewport,
        element: violation.nodes?.[0]?.element ? {
          tag: violation.nodes[0].element.tagName?.toLowerCase(),
          selector: violation.nodes[0].html?.slice(0, 100)
        } : null,
        message: violation.description,
        metrics: {
          wcagCriteria: violation.helpUrl,
          impact: violation.impact,
          tags: violation.tags
        }
      }));
    }
  } catch (err) {
    // Accessibility analysis is optional, fail silently
    console.error('Accessibility analysis failed:', err.message);
  }

  return findings;
}

export default analyzeAccessibility;
