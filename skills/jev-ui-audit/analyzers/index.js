/**
 * Route Discovery
 * Automatically discovers routes in the application.
 */

import { analyzeOverflow } from './overflow.js';
import { analyzeClipping } from './clipping.js';
import { analyzeOverlap } from './overlap.js';
import { analyzeVisibility } from './visibility.js';
import { analyzeAccessibility } from './accessibility.js';

export async function discoverRoutes(context) {
  const { page, baseUrl } = context;

  const routes = await page.evaluate(() => {
    const routes = new Set();

    // Collect links
    const links = document.querySelectorAll('a[href]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href && href.startsWith('/') && !href.startsWith('//')) {
        routes.add(href.split('?')[0].split('#')[0]);
      }
    }

    // Collect form actions
    const forms = document.querySelectorAll('form[action]');
    for (const form of forms) {
      const action = form.getAttribute('action');
      if (action && action.startsWith('/') && !action.startsWith('//')) {
        routes.add(action.split('?')[0].split('#')[0]);
      }
    }

    return Array.from(routes).filter(r => r.length > 1 && r !== '/').slice(0, 20);
  });

  return routes.length > 0 ? routes : ['/'];
}

export async function runAnalyzers(context) {
  const allFindings = [];

  // Run each analyzer
  const analyzers = [
    analyzeOverflow,
    analyzeClipping,
    analyzeOverlap,
    analyzeVisibility,
    analyzeAccessibility
  ];

  for (const analyzer of analyzers) {
    try {
      const findings = await analyzer(context);
      allFindings.push(...findings);
    } catch (err) {
      console.error(`Analyzer ${analyzer.name} failed:`, err.message);
    }
  }

  return allFindings;
}

export { analyzeOverflow, analyzeClipping, analyzeOverlap, analyzeVisibility, analyzeAccessibility };
