/**
 * JSON Reporter
 * Outputs findings in JSON format.
 */

import fs from 'node:fs';
import path from 'node:path';

export function reportJSON(results, options = {}) {
  const { outputPath } = options;

  const report = {
    runId: results.runId,
    timestamp: results.timestamp,
    baseUrl: results.baseUrl,
    summary: {
      score: results.score,
      complete: results.complete ?? true,
      failedAnalyzers: results.failedAnalyzers || [],
      totalFindings: results.findings.length,
      bySeverity: results.bySeverity,
      byCategory: results.byCategory
    },
    config: results.config,
    routes: results.routes,
    viewports: results.viewports,
    findings: results.findings
  };

  const json = JSON.stringify(report, null, 2);

  if (outputPath) {
    fs.writeFileSync(outputPath, json, 'utf-8');
    console.log(`Report saved to: ${outputPath}`);
  }

  return json;
}

export function printSummary(results) {
  const { score, findings, bySeverity, routes, viewports } = results;

  console.log('\n┌─────────────────────────────────────────────────────────────┐');
  console.log('│                    UI AUDIT SUMMARY                        │');
  console.log('├─────────────────────────────────────────────────────────────┤');
  console.log(`│  Score: ${score >= 80 ? '🟢' : score >= 50 ? '🟡' : '🔴'} ${score}/100                                          │`);
  console.log(`│  Routes tested: ${routes.length}                                           │`);
  console.log(`│  Viewports: ${viewports.join(', ')}                             │`);
  console.log(`│  Total findings: ${findings.length}                                         │`);
  console.log('├─────────────────────────────────────────────────────────────┤');
  console.log('│  By Severity:                                               │');

  const severityOrder = ['blocker', 'critical', 'high', 'medium', 'low', 'info'];
  for (const sev of severityOrder) {
    const count = bySeverity[sev] || 0;
    if (count > 0) {
      const label = sev.charAt(0).toUpperCase() + sev.slice(1).padEnd(8);
      console.log(`│    ${label}: ${count}                                                │`);
    }
  }

  console.log('└─────────────────────────────────────────────────────────────┘\n');

  const failed = results.failedAnalyzers || [];
  if (failed.length > 0) {
    console.log(`⛔ Audit INCOMPLETO: ${failed.length} analyzer(s) falharam (score não é confiável)`);
    for (const f of failed.slice(0, 10)) {
      console.log(`  ${f.analyzer} @ ${f.route} ${f.viewport || ''}: ${f.error}`);
    }
    console.log('');
  }

  // Print top findings
  const critical = findings.filter(f => f.severity === 'critical' || f.severity === 'blocker');
  if (critical.length > 0) {
    console.log('⚠️  Critical Issues:');
    for (const f of critical.slice(0, 5)) {
      console.log(`  [${f.id}] ${f.message}`);
      console.log(`      ${f.route} @ ${f.viewport?.name || 'default'}`);
    }
    console.log('');
  }
}

export default { reportJSON, printSummary };
