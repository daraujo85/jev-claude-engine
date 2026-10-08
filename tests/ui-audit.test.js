import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAnalyzers } from '../skills/jev-ui-audit/analyzers/index.js';
import { calculateScore, markSharedFindings } from '../skills/jev-ui-audit/ui-audit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../skills/jev-ui-audit/fixtures/test-page.html');
const RESPONSIVE = path.resolve(__dirname, '../skills/jev-ui-audit/fixtures/responsive-page.html');
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

async function auditFixture(viewport, config = {}, file = FIXTURE) {
  const browser = new BrowserAdapter();
  await browser.start();
  try {
    await browser.setViewport(viewport.width, viewport.height);
    await browser.page.setContent(fs.readFileSync(file, 'utf-8'));
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

test('ui-audit: finding repetido em várias rotas é marcado e conta uma vez', () => {
  const mk = (route, selector, vp = 'desktop') => ({ rule: 'a11y-button-name', severity: 'critical', route, viewport: { name: vp }, element: { selector } });
  const fs = [mk('/a', '.menu'), mk('/b', '.menu'), mk('/a', '.so-aqui'), mk('/b', '.menu', 'mobile')];
  const { unique, shared } = markSharedFindings(fs);
  assert.equal(unique.length, 3);
  assert.equal(shared.length, 2);
  assert.deepEqual(fs[0].sharedRoutes, ['/a', '/b']);
  assert.equal(fs[2].sharedRoutes, null);
  assert.equal(fs[3].sharedRoutes, null); // mesmo seletor, outro viewport
});

test('ui-audit: content-clipping diz o que ficou fora da caixa', { skip: skipReason }, async () => {
  const browser = new BrowserAdapter();
  await browser.start();
  try {
    await browser.setViewport(1440, 300);
    await browser.page.setContent(`<!DOCTYPE html><html lang="pt-BR"><head><title>t</title></head><body style="margin:0">
      <nav class="lateral" style="height:120px;overflow:hidden">${['Início', 'Pedidos', 'Clientes', 'Relatórios', 'Ajustes', 'Sair']
        .map(t => `<a href="/${t}" style="display:block;height:40px">${t}</a>`).join('')}</nav></body></html>`);
    const { findings } = await runAnalyzers({ page: browser.page, route: '/x', viewport: DESKTOP, config: { accessibility: false } });
    const clip = findings.find(f => f.rule === 'content-clipping');
    assert.ok(clip, JSON.stringify(findings));
    assert.deepEqual(clip.evidence.cutItems, ['Relatórios', 'Ajustes', 'Sair']);
    assert.match(clip.message, /3 elemento\(s\) fora da caixa/);
  } finally {
    await browser.close();
  }
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
    'covered-element',
    'touch-target-size',
    'a11y-image-alt'
  ]) {
    assert.ok(rules.has(rule), `esperava ${rule}, veio: ${[...rules].join(', ')}`);
  }

  const overflow = findings.find(f => f.rule === 'horizontal-overflow');
  assert.equal(overflow.severity, 'critical');
  assert.ok(overflow.element?.selector, 'overflow sem seletor do elemento raiz');

  // overlap + covered do mesmo botão viram um finding só, com quem cobre e quanto
  const covered = findings.find(f => f.rule === 'covered-element');
  assert.equal(covered.element.selector, 'button.covered-button');
  assert.equal(covered.metrics.coveredBy, 'div.floating-overlay');
  assert.equal(covered.metrics.coveredRatio, 1);
  assert.ok(!findings.some(f => f.rule === 'element-overlap' && f.element?.selector === 'button.covered-button'));

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

// responsive-page.html: bugs plantados por media query (M* só mobile, D* só desktop)
// e controles que NÃO podem gerar finding (rolagem intencional, ellipsis, ícone
// dentro do input, sr-only, menu display:none)
const keysOf = findings => new Set(findings.map(f => `${f.rule} ${f.element?.selector}`));

test('ui-audit: responsive-page no mobile acha só os bugs de mobile', { skip: skipReason }, async () => {
  const { findings, failures } = await auditFixture(MOBILE, {}, RESPONSIVE);
  assert.deepEqual(failures, []);
  const keys = keysOf(findings);
  for (const k of [
    'horizontal-overflow section.promo-banner',
    'content-clipping h3',
    'covered-element button.btn.entrar',
    'collapsed-element section.stats',
    'touch-target-size button.hamburger',
    'a11y-image-alt img',
    'a11y-color-contrast .footer-note'
  ]) assert.ok(keys.has(k), `faltou ${k}; veio: ${[...keys].join(' | ')}`);

  // bugs de desktop não vazam pro mobile
  for (const k of ['horizontal-overflow section.data-table', 'covered-element button.btn.salvar', 'a11y-button-name .icon-only']) {
    assert.ok(!keys.has(k), `${k} não deveria aparecer no mobile`);
  }
  // controles e duplicações
  const sels = findings.map(f => f.element?.selector || '');
  assert.ok(!sels.some(s => /table-wrap|ellipsis|sr-only|search|icon\b/.test(s)), `falso positivo em controle: ${sels.join(', ')}`);
  assert.ok(!findings.some(f => f.rule === 'element-overlap' && f.element?.selector === 'button.btn.entrar'), 'overlap duplicando o covered-element');
});

test('ui-audit: responsive-page no desktop acha só os bugs de desktop', { skip: skipReason }, async () => {
  const { findings, failures } = await auditFixture(DESKTOP, {}, RESPONSIVE);
  assert.deepEqual(failures, []);
  const keys = keysOf(findings);
  for (const k of [
    'horizontal-overflow section.data-table',
    'content-clipping ul',
    'covered-element button.btn.salvar',
    'a11y-button-name .icon-only'
  ]) assert.ok(keys.has(k), `faltou ${k}; veio: ${[...keys].join(' | ')}`);

  for (const k of ['horizontal-overflow section.promo-banner', 'covered-element button.btn.entrar', 'collapsed-element section.stats', 'content-clipping h3']) {
    assert.ok(!keys.has(k), `${k} não deveria aparecer no desktop`);
  }
  assert.ok(!findings.some(f => f.rule === 'touch-target-size'));
  const covered = findings.find(f => f.rule === 'covered-element');
  assert.equal(covered.metrics.coveredBy, 'aside.side-panel');
});

// Benchmark: cada fixtures/*.expected.json lista os findings que os bugs
// plantados devem gerar por viewport; controls-page.html é só padrão legítimo.
// Recall e precisão têm que ficar em 100%.
test('ui-audit: benchmark de fixtures com 100% de recall e precisão', { skip: skipReason, timeout: 600000 }, async () => {
  const http = await import('node:http');
  const { benchFixture, summarize } = await import('../skills/jev-ui-audit/bench/run.js');
  const dir = path.resolve(__dirname, '../skills/jev-ui-audit/fixtures');
  const server = http.createServer((req, res) => {
    const file = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const rows = [];
  try {
    for (const m of fs.readdirSync(dir).filter(f => f.endsWith('.expected.json'))) {
      rows.push(...await benchFixture(path.join(dir, m), `http://127.0.0.1:${server.address().port}`));
    }
  } finally {
    server.close();
  }
  const total = summarize(rows);
  const report = rows
    .filter(r => r.missing.length || r.unexpected.length)
    .map(r => `${r.fixture}[${r.viewport}] faltou: ${r.missing.join(', ') || '-'} | inesperado: ${r.unexpected.join(', ') || '-'}`)
    .join('\n');
  assert.deepEqual(total.failures, []);
  assert.equal(total.recall, 1, report);
  assert.equal(total.precision, 1, report);
  assert.ok(total.expected >= 149, 'benchmark encolheu');
});

// Login estilo SPA: input sem type nem label (como o admin do Prata), senha,
// botão sem type=submit. /privada redireciona pro login sem o cookie.
function loginServer() {
  return import('node:http').then(http => http.createServer((req, res) => {
    const logged = /sessao=ok/.test(req.headers.cookie || '');
    const html = body => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>t</title></head><body>${body}</body></html>`); };
    if (req.url === '/login') {
      return html(`<main><label>E-mail</label><input class="input" placeholder="voce@x.com">
        <label>Senha</label><input class="input" type="password"><button class="button">Entrar</button>
        <script>document.querySelector('button').onclick = () => {
          if (document.querySelector('[type=password]').value !== 'certa') return;
          document.cookie = 'sessao=ok; path=/'; location.href = '/painel';
        };</script></main>`);
    }
    if (req.url === '/painel') return logged ? html('<main><h1>Painel</h1></main>') : (res.writeHead(302, { location: '/login' }), res.end());
    if (req.url === '/privada') { res.writeHead(302, { location: '/login' }); return res.end(); }
    res.writeHead(404); res.end();
  }));
}

test('ui-audit: authenticate loga em form SPA e falha alto com senha errada', { skip: skipReason }, async () => {
  const server = await loginServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = new BrowserAdapter();
  await browser.start();
  try {
    await browser.authenticate('a@b.com', 'certa', `${base}/login`);
    assert.equal(browser.page.url(), `${base}/painel`);
    assert.equal(await browser.page.inputValue('input.input:not([type])').catch(() => 'sumiu'), 'sumiu');

    const outro = new BrowserAdapter();
    await outro.start();
    await assert.rejects(outro.authenticate('a@b.com', 'errada', `${base}/login`), /Login falhou/);
    await outro.close();
  } finally {
    await browser.close();
    server.close();
  }
});

test('ui-audit: rota que redireciona pro login vira falha, não audit da tela de login', { skip: skipReason }, async () => {
  const { auditUrl } = await import('../skills/jev-ui-audit/ui-audit.js');
  const server = await loginServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const { findings, failures } = await auditUrl(`${base}/painel`, {
      routes: ['/painel', '/privada'], viewports: [DESKTOP], accessibility: false, lighthouse: false,
      username: 'a@b.com', password: 'certa', loginUrl: `${base}/login`
    });
    assert.ok(findings.every(f => f.route === '/painel'), JSON.stringify(findings));
    assert.equal(failures.length, 1, JSON.stringify(failures));
    assert.equal(failures[0].route, '/privada');
    assert.equal(failures[0].analyzer, 'auth');
    // /painel continua logado: a falha é da rota, não da sessão
    assert.equal(failures[0].sessionValid, true);
    assert.match(failures[0].error, /rota não existe no router ou o usuário não tem permissão/);
  } finally {
    server.close();
  }
});
