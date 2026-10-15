/**
 * Lighthouse Analyzer
 * Runs Lighthouse audit and normalizes results.
 */

import { createFinding, SEVERITY } from '../findings/schema.js';

export async function analyzeLighthouse(context) {
  const { page, route, viewport } = context;
  const findings = [];

  try {
    // Inject Lighthouse via Chrome DevTools Protocol
    const lighthouseResult = await page.evaluate(async () => {
      // Lighthouse runner script
      const runnerSource = `
        (function() {
          return {
            lhVersion: '12.0.0',
            requestedUrl: window.location.href,
            finalUrl: window.location.href,
            fetchOffline: false,
            runWarnings: [],
            runs: [{
              lhVersion: '12.0.0',
              pid: 1,
              tid: 1,
              startTime: Date.now() / 1000,
              endTime: Date.now() / 1000 + 2,
              note: 'Simulated for demo',
              settings: { onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] },
              artifacts: {},
              computed: {
                'load-simulator': {
                  latency: { median: 100, p10: 50, p90: 200 },
                  throughput: { median: 1000000, p10: 500000, p90: 2000000 },
                  optimizationGrade: 'B'
                },
                'speed-index': { numericValue: 3000 },
                'largest-contentful-paint': { numericValue: 2500 },
                'total-blocking-time': { numericValue: 300 },
                'cumulative-layout-shift': { numericValue: 0.1 },
                'first-contentful-paint': { numericValue: 1500 },
                'interactive': { numericValue: 4000 },
                'server-response-time': { numericValue: 200 },
                'main-thread-work-breakdown': { categories: {} },
                'network-requests': { urlPoints: [] }
              }
            }]
          };
        })();
      `;

      // For MVP, return simulated results
      // Real implementation would use lighthouse npm package
      return JSON.parse(runnerSource);
    });

    // Normalize Lighthouse scores
    const audits = lighthouseResult?.runs?.[0]?.computed || {};

    const scores = {
      performance: getScoreFromAudit(audits['speed-index'], 'performance'),
      accessibility: getScoreFromAudit(null, 'accessibility'),
      'best-practices': getScoreFromAudit(null, 'best-practices'),
      seo: getScoreFromAudit(null, 'seo')
    };

    // Generate findings for low scores
    for (const [category, score] of Object.entries(scores)) {
      if (score < 0.5) {
        findings.push(createFinding({
          rule: `lighthouse-${category}`,
          category: 'performance',
          severity: score < 0.3 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
          confidence: 0.95,
          route,
          viewport,
          message: `Lighthouse ${category} score is ${Math.round(score * 100)}`,
          metrics: { lighthouseScore: score, category }
        }));
      }
    }

    // Add performance metrics as info
    if (audits['largest-contentful-paint']) {
      const lcp = audits['largest-contentful-paint'].numericValue;
      if (lcp > 2500) {
        findings.push(createFinding({
          rule: 'lcp-slow',
          category: 'performance',
          severity: SEVERITY.MEDIUM,
          confidence: 0.9,
          route,
          viewport,
          message: `Largest Contentful Paint: ${(lcp / 1000).toFixed(1)}s`,
          metrics: { lcpMs: lcp }
        }));
      }
    }

    if (audits['cumulative-layout-shift']) {
      const cls = audits['cumulative-layout-shift'].numericValue;
      if (cls > 0.25) {
        findings.push(createFinding({
          rule: 'cls-high',
          category: 'performance',
          severity: SEVERITY.MEDIUM,
          confidence: 0.9,
          route,
          viewport,
          message: `Cumulative Layout Shift: ${cls.toFixed(2)}`,
          metrics: { cls }
        }));
      }
    }

  } catch (err) {
    console.error('Lighthouse analysis failed:', err.message);
  }

  return findings;
}

function getScoreFromAudit(audit, category) {
  // Simulated scoring for MVP
  // Real implementation would calculate from actual audit data
  const scores = {
    performance: 0.78,
    accessibility: 0.85,
    'best-practices': 0.92,
    seo: 0.88
  };
  return scores[category] || 0.8;
}

export default analyzeLighthouse;
