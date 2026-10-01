#!/usr/bin/env node
/**
 * JEV Claude Engine — Guided Setup
 * Walks a new machine through the dependency checklist and installs what it can:
 *   1. Node.js              (hard requirement)
 *   2. Docker + daemon      (needed to run a local 9Router)
 *   3. 9Router on :20128    (model gateway — starts via docker compose if missing)
 *   4. JEV/Typesafe API key (env, ~/.claude/settings.json, or ~/.jev/config.json)
 *   5. Hooks                (rule-guard, test-verifier, skill-picker, task-router, fast-compact)
 *   6. Statusline           (⚡JEV on in the Claude Code footer)
 *   7. Skills symlinks      (jev-*)
 *   8. Subagents            (one per task type, model = combo)
 *
 * Interactive: asks before touching the system. Non-interactive (CI/pipe):
 * runs the checks, prints the checklist, installs nothing.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills');
const HOOKS_DIR = path.join(CLAUDE_DIR, 'hooks');
const JEV_DIR = path.join(HOME, '.jev');
const CONFIG_FILE = path.join(JEV_DIR, 'config.json');
const NINE_ROUTER_DIR = path.join(HOME, '.9router');
const COMPOSE_FILE = path.join(NINE_ROUTER_DIR, 'docker-compose.yml');

const PROJECT_DIR = process.env.JEV_PROJECT_DIR || '/Users/diegoaraujo/Documents/projects/jev-claude-engine';
const API_KEY = process.env.JEV_API_KEY || '';
const ROUTER_PORT = 20128;
const ROUTER_URL = `http://localhost:${ROUTER_PORT}`;

const isTTY = process.stdin.isTTY;
const isCheckOnly = process.argv.includes('--check');
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, def = '') => new Promise(res => rl.question(q, a => res(a.trim() || def)));
const yesno = async (q, def = true) => {
  const suffix = def ? '(s/N)' : '(S/n)';
  const a = (await ask(`${q} ${suffix} `)).toLowerCase();
  if (!a) return def;
  return ['s', 'sim', 'y', 'yes', '1'].includes(a);
};

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', grn: '\x1b[32m', red: '\x1b[31m',
  yel: '\x1b[33m', cyn: '\x1b[36m', mag: '\x1b[35m', bld: '\x1b[1m'
};
const ok = s => `${C.grn}✓${C.reset} ${s}`;
const fail = s => `${C.red}✗${C.reset} ${s}`;
const warn = s => `${C.yel}⚠${C.reset} ${s}`;
const step = s => `\n${C.bld}${C.cyn}${s}${C.reset}`;

const results = [];

async function run() {
  banner();
  if (!isTTY || isCheckOnly) { await checkOnly(); return; }

  await checkNode();
  await checkDocker();
  await checkRouter();
  await checkApiKey();
  await installHooks();
  await installStatusline();
  await linkSkills();
  await generateSubagents();
  await healthCheck();
  await finalize();

  rl.close();
  summary();
}

function banner() {
  console.log(`
${C.bld}${C.mag}============================================================${C.reset}
${C.bld}   JEV CLAUDE ENGINE — SETUP GUIADO${C.reset}
   motor de decisão + roteamento de subagents pro Claude Code
${C.bld}${C.mag}============================================================${C.reset}`);
}

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */

async function checkNode() {
  console.log(step('1. Node.js'));
  const v = spawnSync('node', ['--version'], { encoding: 'utf8' });
  if (v.status !== 0) {
    console.log(fail('Node.js não encontrado.'));
    await openLink('https://nodejs.org', 'Instale Node.js ≥ 18: https://nodejs.org');
    process.exit(1);
  }
  const ver = v.stdout.trim().replace('v', '');
  const major = parseInt(ver.split('.')[0], 10);
  if (major < 18) {
    console.log(fail(`Node ${ver} — precisa de ≥ 18.`));
    await openLink('https://nodejs.org', 'Atualize: https://nodejs.org');
    process.exit(1);
  }
  console.log(ok(`Node.js ${ver}`));
  results.push(['node', true]);
}

async function checkDocker() {
  console.log(step('2. Docker'));
  const v = spawnSync('docker', ['--version'], { encoding: 'utf8' });
  if (v.status !== 0) {
    console.log(fail('Docker não instalado.'));
    const installed = await installDocker();
    if (!installed) {
      await openLink('https://www.docker.com/products/docker-desktop/', 'Baixe o Docker Desktop: https://www.docker.com/products/docker-desktop/');
      console.log(warn('Reinicie o terminal e rode este script de novo quando o Docker estiver no ar.'));
      results.push(['docker', false]);
      return;
    }
  } else {
    console.log(ok(`Docker instalado: ${v.stdout.trim()}`));
  }
  // daemon up?
  const ping = spawnSync('docker', ['info'], { encoding: 'utf8' });
  if (ping.status !== 0) {
    console.log(fail('Docker instalado, mas o daemon não está rodando.'));
    console.log('   Abra o Docker Desktop e aguarde o ícone parar de piscar.');
    await openLink('docker://', 'Abrir Docker Desktop');
    await ask('\n   Pressione Enter quando o Docker estiver rodando…');
  }
  console.log(ok('Daemon Docker respondendo'));
  results.push(['docker', true]);
}

async function installDocker() {
  if (process.platform !== 'darwin') {
    console.log('   Auto-instalação só suportada em macOS. Instale manualmente pelo link.');
    return false;
  }
  if (!(await yesno('   Docker não encontrado. Baixar e instalar o Docker Desktop agora?'))) {
    return false;
  }
  try {
    console.log('   Baixando Docker Desktop (dmg)…');
    execSync('curl -L -o /tmp/Docker.dmg "https://desktop.docker.com/mac/main/amd64/Docker.dmg" && hdiutil attach /tmp/Docker.dmg -quiet && cp -R "/Volumes/Docker/Docker.app" /Applications/ && hdiutil detach /Volumes/Docker -quiet', { stdio: 'inherit' });
    console.log(ok('Docker Desktop instalado em /Applications.'));
    await ask('\n   Abra o Docker Desktop pela primeira vez e pressione Enter quando o daemon estiver no ar…');
    return true;
  } catch (e) {
    console.log(fail('Falha ao instalar Docker automaticamente.'));
    return false;
  }
}

async function checkRouter() {
  console.log(step('3. 9Router (gateway de modelos)'));
  if (await pingRouter()) {
    console.log(ok(`9Router respondendo em ${ROUTER_URL}`));
    results.push(['router', true]);
    return;
  }
  console.log(fail(`Nenhum 9Router em ${ROUTER_URL}.`));
  console.log(`   O 9Router é o gateway que junta os modelos (Claude, Gemini, etc.) num combo
   com failover. O JEV usa ele pra rotear cada tarefa pro melhor modelo.`);
  if (!(await yesno('   Subir um 9Router local via Docker agora?'))) {
    console.log(warn('Você pode apontar pra um 9Router remoto depois: edite a seção "router" em ~/.jev/config.json.'));
    results.push(['router', false]);
    return;
  }
  await startRouter();
  if (await pingRouter()) {
    console.log(ok(`9Router no ar em ${ROUTER_URL}`));
    results.push(['router', true]);
  } else {
    console.log(fail('9Router não subiu. Veja os logs com: docker compose -f ~/.9router/docker-compose.yml logs'));
    results.push(['router', false]);
  }
}

async function pingRouter() {
  const r = spawnSync('curl', ['-s', '-m', '3', '-o', '/dev/null', '-w', '%{http_code}', ROUTER_URL], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim().length > 0 && r.stdout.trim() !== '000';
}

async function startRouter() {
  fs.mkdirSync(NINE_ROUTER_DIR, { recursive: true });
  // Generate JWT secret once and persist in .env (so restarts keep the same).
  let jwt = '';
  try {
    const envFile = path.join(NINE_ROUTER_DIR, '.env');
    const prev = fs.readFileSync(envFile, 'utf-8').match(/^JWT_SECRET=(.*)$/m);
    jwt = prev ? prev[1] : randomBytes(32).toString('hex');
    const cur = fs.readFileSync(envFile, 'utf-8').replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${jwt}`);
    fs.writeFileSync(envFile, cur === fs.readFileSync(envFile, 'utf-8') ? `${cur.trim()}\nJWT_SECRET=${jwt}\n` : cur);
  } catch {
    fs.writeFileSync(path.join(NINE_ROUTER_DIR, '.env'), `JWT_SECRET=${jwt}\n`);
  }
  if (!fs.existsSync(COMPOSE_FILE)) {
    fs.writeFileSync(COMPOSE_FILE, COMPOSE_TEMPLATE);
    console.log(`   docker-compose criado: ${COMPOSE_FILE}`);
  }
  console.log('   Subindo 9router + headroom + watchtower…');
  try {
    execSync(`cd ${NINE_ROUTER_DIR} && docker compose up -d`, { stdio: 'inherit' });
  } catch (e) {
    console.log(fail('docker compose up falhou.'));
    return;
  }
  // wait for it to come up (up to ~30s)
  for (let i = 0; i < 15; i++) {
    if (await pingRouter()) return;
    await new Promise(r => setTimeout(r, 2000));
  }
}

async function checkApiKey() {
  console.log(step('4. API key JEV / Typesafe'));
  const key = resolveKey();
  if (key) {
    console.log(ok(`API key encontrada (${key.slice(0, 10)}…)`));
    results.push(['key', true]);
    return;
  }
  console.log(fail('Nenhuma API key JEV encontrada.'));
  console.log(`   A key é o que autentica as chamadas ao motor de decisão (System One).
   $5 dólares por mês já é bastante pro uso geral de um dev.`);
  if (!(await yesno('   Criar conta e pegar a key agora?'))) {
    console.log(warn('Pule a key por enquanto — o JEV funciona em modo mock, mas sem roteamento real.'));
    console.log('   Depois: crie a conta e rode este script de novo, ou edite ~/.jev/config.json.');
    results.push(['key', false]);
    return;
  }
  await openLink('https://typesafe.ai', 'Abra https://typesafe.ai, crie sua conta (a partir de $5/mês)');
  const k = await ask('   Cole sua API key aqui: ');
  if (!k || k.length < 10) {
    console.log(warn('Key inválida — pulando.'));
    results.push(['key', false]);
    return;
  }
  const cfg = loadJevConfig();
  cfg.jev.api_key = k;
  saveJevConfig(cfg);
  console.log(ok('Key salva em ~/.jev/config.json'));
  results.push(['key', true]);
}

/* ------------------------------------------------------------------ */
/* Installers                                                          */
/* ------------------------------------------------------------------ */

function loadJevConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch { /* re-create */ }
  return { jev: { api_key: '' }, router: { base_url: ROUTER_URL } };
}
function saveJevConfig(cfg) {
  fs.mkdirSync(JEV_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
}

function resolveKey() {
  if (process.env.JEV_API_KEY) return process.env.JEV_API_KEY;
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  const cfg = loadJevConfig();
  if (cfg?.jev?.api_key) return cfg.jev.api_key;
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    if (s?.env?.JEV_API_KEY) return s.env.JEV_API_KEY;
    if (s?.env?.TYPESAFE_API_KEY) return s.env.TYPESAFE_API_KEY;
  } catch { /* ignore */ }
  return '';
}

async function installHooks() {
  console.log(step('5. Hooks JEV'));
  if (!fs.existsSync(SETTINGS_FILE)) {
    console.log(fail(`~/.claude/settings.json não existe. Rode o Claude Code uma vez pra criá-lo.`));
    return;
  }
  const backupFile = `${SETTINGS_FILE}.bak-${Date.now()}`;
  fs.copyFileSync(SETTINGS_FILE, backupFile);

  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  const key = resolveKey();
  settings.env = settings.env || {};
  if (key) { settings.env.TYPESAFE_API_KEY = key; settings.env.JEV_API_KEY = key; }

  settings.hooks = settings.hooks || {};

  // PreToolUse — rule-guard
  settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];
  pushHookIfMissing(settings.hooks.PreToolUse, 'jev-rule-guard',
    `node ${path.join(PROJECT_DIR, 'hooks', 'jev-rule-guard.js')}`,
    'FileEdit|FileWrite|Write|Edit|replace_file_content|write_to_file');

  // PostToolUse — test-verifier
  settings.hooks.PostToolUse = settings.hooks.PostToolUse || [];
  pushHookIfMissing(settings.hooks.PostToolUse, 'jev-test-verifier',
    `node ${path.join(PROJECT_DIR, 'hooks', 'jev-test-verifier.js')}`,
    'FileEdit|FileWrite|Write|Edit|replace_file_content|write_to_file');

  // UserPromptSubmit — skill-picker + task-router
  settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit || [];
  if (settings.hooks.UserPromptSubmit.length > 0 && Array.isArray(settings.hooks.UserPromptSubmit[0].hooks)) {
    const list = settings.hooks.UserPromptSubmit[0].hooks;
    pushToListIfMissing(list, 'jev-skill-picker', `node ${path.join(PROJECT_DIR, 'hooks', 'jev-skill-picker.js')}`);
    pushToListIfMissing(list, 'jev-task-router', `node ${path.join(PROJECT_DIR, 'hooks', 'jev-task-router.js')}`);
  } else {
    settings.hooks.UserPromptSubmit.push({ hooks: [
      { type: 'command', command: `node ${path.join(PROJECT_DIR, 'hooks', 'jev-skill-picker.js')}` },
      { type: 'command', command: `node ${path.join(PROJECT_DIR, 'hooks', 'jev-task-router.js')}` }
    ]});
  }

  // PreCompact — fast-compact
  settings.hooks.PreCompact = settings.hooks.PreCompact || [];
  pushHookIfMissing(settings.hooks.PreCompact, 'jev-fast-compact',
    `node ${path.join(PROJECT_DIR, 'hooks', 'jev-fast-compact.js')}`, null);

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  console.log(ok(`settings.json atualizado (backup em ${path.basename(backupFile)})`));
  results.push(['hooks', true]);
}

function pushHookIfMissing(entries, needle, command, matcher) {
  const has = entries.some(e => (e.hooks || []).some(h => (h.command || '').includes(needle)));
  if (has) return;
  entries.push({ matcher: matcher || '.*', hooks: [{ type: 'command', command }] });
  console.log(`   + hook ${needle}`);
}

function pushToListIfMissing(list, needle, command) {
  if (list.some(h => (h.command || '').includes(needle))) return;
  list.push({ type: 'command', command });
  console.log(`   + hook ${needle}`);
}

async function installStatusline() {
  console.log(step('6. Statusline (indicador ⚡JEV on no rodapé)'));
  const src = path.join(PROJECT_DIR, 'hooks', 'statusline', 'jev-statusline.sh');
  const dest = path.join(HOOKS_DIR, 'jarvis-statusline.sh');
  if (!fs.existsSync(src)) { console.log(warn('statusline não encontrado no projeto — pulando.')); return; }
  fs.mkdirSync(HOOKS_DIR, { recursive: true });
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  settings.statusLine = { type: 'command', command: '~/.claude/hooks/jarvis-statusline.sh' };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  console.log(ok('statusline instalado e registrado no settings.json'));
  results.push(['statusline', true]);
}

async function linkSkills() {
  console.log(step('7. Skills JEV'));
  const skills = ['jev-discover', 'jev-explore', 'jev-review', 'jev-plan-evaluator', 'jev-anti-regression', 'jev-browser-test', 'jev-vision', 'business-acceptance-review'];
  let n = 0;
  for (const s of skills) {
    const src = path.join(PROJECT_DIR, 'skills', s);
    const dest = path.join(SKILLS_DIR, s);
    if (!fs.existsSync(src)) continue;
    if (!fs.existsSync(dest)) {
      try { fs.symlinkSync(src, dest, 'dir'); }
      catch { fs.cpSync(src, dest, { recursive: true }); }
    }
    n++;
  }
  console.log(ok(`${n} skills disponíveis em ~/.claude/skills/`));
  results.push(['skills', n]);
}

async function generateSubagents() {
  console.log(step('8. Subagents por tipo de tarefa'));
  const script = path.join(PROJECT_DIR, 'scripts', 'generate-subagents.js');
  if (!fs.existsSync(script)) { console.log(warn('generate-subagents.js não encontrado — pulando.')); return; }
  const r = spawnSync('node', [script], { encoding: 'utf8' });
  console.log(`   ${r.stdout.trim() || r.stderr.trim()}`);
  results.push(['subagents', r.status === 0]);
}

async function healthCheck() {
  console.log(step('9. Health dos combos do 9Router'));
  const script = path.join(PROJECT_DIR, 'scripts', '9router-health.js');
  if (!fs.existsSync(script)) { console.log(warn('9router-health.js não encontrado — pulando.')); return; }
  if (!(await pingRouter())) {
    console.log(warn('9Router não respondeu — pulando health check.'));
    results.push(['health', false]);
    return;
  }
  const r = spawnSync('node', [script], { encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] });
  results.push(['health', r.status === 0]);
}

/* ------------------------------------------------------------------ */
/* Helpers / output                                                    */
/* ------------------------------------------------------------------ */

async function finalize() {
  console.log(step('Finalizando'));
  console.log('   Próximos passos:');
  console.log('   1. Reinicie o Claude Code pra carregar hooks + statusline novos.');
  console.log('   2. Abra o dashboard:  node bin/jev.js dashboard');
  console.log('   3. Rode o profiler no dashboard (view 9Router) pra eleger os melhores combos.');
}

function summary() {
  console.log(`\n${C.bld}${C.mag}=== RESUMO DO SETUP ===${C.reset}`);
  const labels = {
    node: 'Node.js', docker: 'Docker', router: '9Router :20128', key: 'API key JEV',
    hooks: 'Hooks JEV', statusline: 'Statusline', skills: 'Skills', subagents: 'Subagents',
    health: 'Health combos'
  };
  for (const [k, v] of results) {
    const ok = v === true || (typeof v === 'number' && v > 0);
    console.log(`  ${ok ? C.grn + '✓' : C.red + '✗'}${C.reset} ${labels[k]}`);
  }
  const allOk = results.every(([, v]) => v === true || (typeof v === 'number' && v > 0));
  if (allOk) console.log(`\n${C.grn}${C.bld}Setup completo! A máquina está pronta, igual à do Diego.${C.reset}`);
  else console.log(`\n${C.yel}Setup parcial — revise os itens marcados com ✗ acima.${C.reset}`);
}

async function checkOnly() {
  // Non-interactive: report state, install nothing.
  console.log('Modo não-interativo: só diagnóstico.\n');
  results.push(['node', spawnSync('node', ['--version'], { encoding: 'utf8' }).status === 0]);
  results.push(['docker', spawnSync('docker', ['--version'], { encoding: 'utf8' }).status === 0]);
  results.push(['router', await pingRouter()]);
  results.push(['key', !!resolveKey()]);
  const s = fs.existsSync(SETTINGS_FILE) ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) : null;
  results.push(['hooks', !!s?.hooks?.PreToolUse?.some(e => JSON.stringify(e).includes('jev-'))]);
  results.push(['statusline', !!s?.statusLine]);
  results.push(['skills', fs.existsSync(path.join(SKILLS_DIR, 'jev-discover'))]);
  results.push(['subagents', fs.existsSync(path.join(CLAUDE_DIR, 'agents', 'jev-writing-code.md'))]);
  results.push(['health', await pingRouter()]);
  summary();
}

async function openLink(url, msg) {
  console.log(`   → ${msg}`);
  if (process.platform === 'darwin') spawnSync('open', [url]);
  else if (process.platform === 'linux') spawnSync('xdg-open', [url]);
  else if (process.platform === 'win32') spawnSync('cmd', ['/c', 'start', url]);
  await ask('\n   Pressione Enter quando tiver feito isso…');
}

const COMPOSE_TEMPLATE = `services:
  9router:
    image: decolua/9router:latest
    container_name: 9router
    pull_policy: always
    restart: unless-stopped
    ports:
      - "20128:20128"
    volumes:
      - ./data:/app/data
    environment:
      DATA_DIR: /app/data
      PORT: "20128"
      HOSTNAME: "0.0.0.0"
      NODE_ENV: production
      JWT_SECRET: "\${JWT_SECRET}"
      INITIAL_PASSWORD: "\${INITIAL_PASSWORD:-dimome092526}"
      REQUIRE_API_KEY: "false"
    depends_on:
      - headroom

  headroom:
    image: ghcr.io/chopratejas/headroom:latest
    container_name: headroom
    pull_policy: always
    restart: unless-stopped
    ports:
      - "8787:8787"

  watchtower:
    image: containrrr/watchtower:latest
    container_name: 9router-watchtower
    restart: unless-stopped
    environment:
      DOCKER_API_VERSION: "1.45"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 1800 --cleanup 9router headroom
`;

run().catch(e => { console.error(e); rl.close(); process.exit(1); });