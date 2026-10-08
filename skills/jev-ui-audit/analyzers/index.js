/**
 * Route Discovery
 * Automatically discovers routes in the application.
 */

import { analyzeOverflow } from './overflow.js';
import { analyzeClipping } from './clipping.js';
import { analyzeOverlap } from './overlap.js';
import { analyzeVisibility } from './visibility.js';
import { analyzeAccessibility } from './accessibility.js';
import { analyzeTouchTargets } from './touch-target.js';

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

/**
 * Roda todos os analyzers e devolve findings + falhas. Um analyzer que quebra
 * deixa o audit incompleto: quem chama precisa saber, senão o score sai 100 falso.
 */
export async function runAnalyzers(context) {
  const findings = [];
  const failures = [];

  const analyzers = [
    analyzeOverflow,
    analyzeClipping,
    analyzeOverlap,
    analyzeVisibility,
    analyzeTouchTargets
  ];
  if (context.config?.accessibility !== false) {
    analyzers.push(analyzeAccessibility);
  }

  for (const analyzer of analyzers) {
    try {
      findings.push(...await analyzer(context));
    } catch (err) {
      console.error(`Analyzer ${analyzer.name} failed:`, err.message);
      failures.push({
        analyzer: analyzer.name,
        route: context.route,
        viewport: context.viewport?.name,
        error: err.message
      });
    }
  }

  return { findings: dedupeCovered(findings), failures };
}

/**
 * overlap e visibility enxergam o mesmo botão tapado por caminhos diferentes.
 * Mantém o covered-element (diz quem cobre) e incorpora o coveredRatio do
 * overlap, para não penalizar o score duas vezes pelo mesmo defeito.
 */
function dedupeCovered(findings) {
  const covered = new Map(
    findings
      .filter(f => f.rule === 'covered-element' && f.element?.selector)
      .map(f => [f.element.selector, f])
  );
  return findings.filter(f => {
    if (f.rule !== 'element-overlap') return true;
    const twin = covered.get(f.element?.selector);
    if (!twin) return true;
    twin.metrics = { ...twin.metrics, coveredRatio: f.metrics.coveredRatio };
    return false;
  });
}

export { analyzeOverflow, analyzeClipping, analyzeOverlap, analyzeVisibility, analyzeAccessibility, analyzeTouchTargets };
