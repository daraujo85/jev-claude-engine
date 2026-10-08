import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAnalyzers } from '../skills/jev-ui-audit/analyzers/index.js';
import { calculateScore } from '../skills/jev-ui-audit/ui-audit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../skills/jev-ui-audit/fixtures/test-page.html');
const MOBILE = { name: 'mobile', width: 390, height: 844, touch: true };
const DESKTOP = { name: 'desktop', width: 1440, height: 900, touch: false };

// Playwright é devDependency e precisa do Chromium baixado: sem ele, pula
let BrowserAdapter = null;
let skipReason = false;
try {
  ({ BrowserAdapter } = await import('../skills/jev-ui-audit/browser/playwright-adapter.js'));
  const { chromium } = await import('playwright');
  if (!fs.existsSync(chromium.executablePath())) skipReason = 'Chromium do Playwright não instalado';
} catch (err) {
  skipReason = `playwright indisponível: ${err.message}`;
}

async function auditFixture(viewport, config = {}) {
  const browser = new BrowserAdapter();
  await browser.start();
  try {
    await browser.setViewport(viewport.width, viewport.height);
    await browser.page.setContent(fs.readFileSync(FIXTURE, 'utf-8'));
    return await runAnalyzers({ page: browser.page, route: '/fixture', viewport, config });
  } finally {
    await browser.close();
  }
}

const rulesOf = findings => new Set(findings.map(f => f.rule));

test('ui-audit: calculateScore penaliza por severidade e não fica negativo', () => {
  assert.equal(calculateScore([]), 100);
  assert.equal(calculateScore([{ severity: 'critical' }, { severity: 'high' }]), 77);
  assert.equal(calculateScore(Array(10).fill({ severity: 'blocker' })), 0);
});

test('ui-audit: setViewport redimensiona a página', { skip: skipReason }, async () => {
  const browser = new BrowserAdapter();
  await browser.start();
  try {
    await browser.setViewport(390, 844);
    assert.deepEqual(browser.page.viewportSize(), { width: 390, height: 844 });
  } finally {
    await browser.close();
  }
});

test('ui-audit: fixture no mobile dispara os findings esperados sem analyzer falhando', { skip: skipReason }, async () => {
  const { findings, failures } = await auditFixture(MOBILE);

  assert.deepEqual(failures, [], `analyzers falharam: ${JSON.stringify(failures)}`);

  const rules = rulesOf(findings);
  for (const rule of [
    'horizontal-overflow',
    'content-clipping',
    'collapsed-element',
    'element-overlap',
    'covered-element',
    'touch-target-size',
    'a11y-image-alt'
  ]) {
    assert.ok(rules.has(rule), `esperava ${rule}, veio: ${[...rules].join(', ')}`);
  }

  const overflow = findings.find(f => f.rule === 'horizontal-overflow');
  assert.equal(overflow.severity, 'critical');
  assert.ok(overflow.element?.selector, 'overflow sem seletor do elemento raiz');

  const covered = findings.find(f => f.rule === 'covered-element');
  assert.equal(covered.element.selector, 'button.covered-button');

  const collapsed = findings.find(f => f.rule === 'collapsed-element');
  assert.equal(collapsed.element.selector, 'div.collapsed-sidebar');

  const imgAlt = findings.find(f => f.rule === 'a11y-image-alt');
  assert.match(imgAlt.element.selector, /img/);
  assert.equal(imgAlt.category, 'accessibility');

  assert.ok(calculateScore(findings) < 80, 'fixture cheia de bugs não pode passar no gate');
});

test('ui-audit: desktop não tem overflow e touch-target só roda em viewport touch', { skip: skipReason }, async () => {
  const { findings, failures } = await auditFixture(DESKTOP);
  assert.deepEqual(failures, []);
  const rules = rulesOf(findings);
  assert.ok(!rules.has('horizontal-overflow'));
  assert.ok(!rules.has('touch-target-size'));
});

test('ui-audit: config.accessibility=false desliga o axe', { skip: skipReason }, async () => {
  const { findings, failures } = await auditFixture(MOBILE, { accessibility: false });
  assert.deepEqual(failures, []);
  assert.ok(!findings.some(f => f.category === 'accessibility'));
});

test('ui-audit: analyzer que quebra aparece em failures em vez de sumir', { skip: skipReason }, async () => {
  const browser = new BrowserAdapter();
  await browser.start();
  try {
    await browser.page.setContent('<p>ok</p>');
    // page fechada força todos os analyzers a falharem
    const page = browser.page;
    await page.close();
    const { findings, failures } = await runAnalyzers({ page, route: '/x', viewport: MOBILE, config: {} });
    assert.equal(findings.length, 0);
    assert.ok(failures.length >= 5);
    assert.ok(failures.every(f => f.route === '/x' && f.viewport === 'mobile' && f.error));
    browser.page = null;
  } finally {
    await browser.close();
  }
});

test('ui-audit: CLI grava report.json com failedAnalyzers', { skip: skipReason }, async () => {
  const { spawn } = await import('node:child_process');
  const http = await import('node:http');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(fs.readFileSync(FIXTURE));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-ui-audit-'));
  const child = spawn('node', [
    path.resolve(__dirname, '../skills/jev-ui-audit/ui-audit.js'),
    base, '--routes', '/fixture', '--viewports', 'mobile',
    '--no-lighthouse', '--output', out, '--gate'
  ], { cwd: os.tmpdir() });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  const status = await new Promise(r => child.on('close', r));
  server.close();
  const res = { status, stdout: log, stderr: '' };
  assert.equal(res.status, 1, res.stdout + res.stderr); // fixture reprova no gate
  const runs = fs.readdirSync(out);
  assert.equal(runs.length, 1);
  const report = JSON.parse(fs.readFileSync(path.join(out, runs[0], 'report.json'), 'utf-8'));
  assert.equal(report.summary.complete, true);
  assert.deepEqual(report.summary.failedAnalyzers, []);
  assert.ok(report.summary.totalFindings > 0);
  assert.ok(report.summary.score < 80);
  fs.rmSync(out, { recursive: true, force: true });
});
