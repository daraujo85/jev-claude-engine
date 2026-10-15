#!/usr/bin/env node
/**
 * Benchmark de detecção do jev-ui-audit.
 * Cada fixtures/<nome>.expected.json lista, por viewport, os findings que os
 * bugs plantados DEVEM gerar ("regra seletor"). Qualquer outro finding é falso
 * positivo. Sai com código 1 se recall ou precisão ficarem abaixo de 100%.
 *
 *   node skills/jev-ui-audit/bench/run.js [--json] [fixture...]
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserAdapter } from '../browser/playwright-adapter.js';
import { runAnalyzers } from '../analyzers/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../fixtures');
const VIEWPORTS = {
  mobile: { name: 'mobile', width: 390, height: 844, touch: true },
  tablet: { name: 'tablet', width: 768, height: 1024, touch: true },
  desktop: { name: 'desktop', width: 1440, height: 900, touch: false }
};

export const keyOf = f => `${f.rule} ${f.element?.selector ?? '-'}`;

// Servidor de verdade (e não setContent) para imagem 404 e URLs relativas se comportarem como em produção
function serve(dir) {
  const server = http.createServer((req, res) => {
    const file = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

export async function benchFixture(manifestFile, baseUrl) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
  const rows = [];
  for (const [vpName, expectedList] of Object.entries(manifest.viewports)) {
    const viewport = VIEWPORTS[vpName];
    const browser = new BrowserAdapter();
    await browser.start();
    let result;
    try {
      await browser.setViewport(viewport.width, viewport.height);
      await browser.open(`${baseUrl}/${manifest.fixture}`);
      await browser.waitForStableState({ timeout: 2000 });
      result = await runAnalyzers({ page: browser.page, route: '/', viewport, config: {} });
    } finally {
      await browser.close();
    }
    const expected = new Set(expectedList);
    const got = new Set(result.findings.map(keyOf));
    rows.push({
      fixture: manifest.fixture,
      viewport: vpName,
      expected: expected.size,
      detected: [...expected].filter(k => got.has(k)).length,
      missing: [...expected].filter(k => !got.has(k)),
      unexpected: [...got].filter(k => !expected.has(k)),
      failures: result.failures
    });
  }
  return rows;
}

export function summarize(rows) {
  const expected = rows.reduce((s, r) => s + r.expected, 0);
  const detected = rows.reduce((s, r) => s + r.detected, 0);
  const unexpected = rows.reduce((s, r) => s + r.unexpected.length, 0);
  return {
    expected,
    detected,
    unexpected,
    recall: expected ? detected / expected : 1,
    precision: detected + unexpected ? detected / (detected + unexpected) : 1,
    failures: rows.flatMap(r => r.failures)
  };
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const names = args.filter(a => !a.startsWith('--'));
  const manifests = fs.readdirSync(FIXTURES)
    .filter(f => f.endsWith('.expected.json'))
    .filter(f => !names.length || names.some(n => f.startsWith(n.replace(/\.html$/, ''))))
    .map(f => path.join(FIXTURES, f));

  const server = await serve(FIXTURES);
  const base = `http://127.0.0.1:${server.address().port}`;
  const rows = [];
  try {
    for (const m of manifests) rows.push(...await benchFixture(m, base));
  } finally {
    server.close();
  }
  const total = summarize(rows);

  if (asJson) {
    console.log(JSON.stringify({ rows, total }, null, 2));
  } else {
    for (const r of rows) {
      const ok = !r.missing.length && !r.unexpected.length && !r.failures.length;
      console.log(`${ok ? '✓' : '✗'} ${r.fixture} [${r.viewport}] ${r.detected}/${r.expected} detectados, ${r.unexpected.length} inesperados`);
      for (const k of r.missing) console.log(`    FALTOU     ${k}`);
      for (const k of r.unexpected) console.log(`    INESPERADO ${k}`);
      for (const f of r.failures) console.log(`    FALHOU     ${f.analyzer}: ${f.error}`);
    }
    console.log(`\nRecall ${(total.recall * 100).toFixed(1)}% (${total.detected}/${total.expected}) · ` +
      `Precisão ${(total.precision * 100).toFixed(1)}% (${total.unexpected} falso(s) positivo(s))`);
  }
  process.exit(total.recall === 1 && total.precision === 1 && !total.failures.length ? 0 : 1);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(2); });
}
