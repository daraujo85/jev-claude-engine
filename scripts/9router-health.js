#!/usr/bin/env node
/**
 * JEV 9Router Health Check — resiliencia proativa de combos.
 * Testa cada modelo de cada combo com um request minimo e reordena
 * automaticamente: modelos saudaveis primeiro, quebrados por ultimo.
 * Se um modelo cai (400/429/5xx), o combo nao trava mais o fluxo —
 * o 9router cai no proximo saudavel.
 *
 * Uso:
 *   node scripts/9router-health.js            # testa + reordena na maquina local
 *   node scripts/9router-health.js --check    # so diagnostica, nao reordena
 *
 * Config via env:
 *   NINE_ROUTER_URL   (default http://localhost:20128)
 *   NINE_ROUTER_PASS  (default le ~/.9router/.env INITIAL_PASSWORD)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.NINE_ROUTER_URL || 'http://localhost:20128';
const PASS = process.env.NINE_ROUTER_PASS || readInitialPassword();
const API_KEY = process.env.NINE_ROUTER_API_KEY || readApiKey();
const CHECK_ONLY = process.argv.includes('--check');
const TIMEOUT = 15000;

const C = { reset:'\x1b[0m', grn:'\x1b[32m', red:'\x1b[31m', yel:'\x1b[33m', dim:'\x1b[2m', bld:'\x1b[1m' };

function readInitialPassword() {
  try {
    const f = path.join(os.homedir(), '.9router', '.env');
    const m = fs.readFileSync(f, 'utf-8').match(/^INITIAL_PASSWORD=(.*)$/m);
    return m ? m[1] : '';
  } catch { return ''; }
}

// API key do gateway — lê de ~/.jev/config.json (router.api_key) ou ~/.claude/settings.json.
function readApiKey() {
  try {
    const f = path.join(os.homedir(), '.jev', 'config.json');
    if (fs.existsSync(f)) {
      const k = JSON.parse(fs.readFileSync(f, 'utf-8'))?.router?.api_key;
      if (k) return k;
    }
  } catch { /* fallthrough */ }
  try {
    const f = path.join(os.homedir(), '.claude', 'settings.json');
    if (fs.existsSync(f)) {
      const k = JSON.parse(fs.readFileSync(f, 'utf-8'))?.env?.ANTHROPIC_AUTH_TOKEN;
      if (k) return k;
    }
  } catch { /* fallthrough */ }
  return '';
}

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASS })
  });
  const setCookie = r.headers.get('set-cookie') || '';
  const token = (setCookie.match(/auth_token=([^;]+)/) || [])[1] || '';
  if (!r.ok || !token) throw new Error('login falhou');
  return token;
}

async function getCombos(token) {
  const r = await fetch(`${BASE}/api/combos`, { headers: { cookie: `auth_token=${token}` } });
  const d = await r.json();
  return Array.isArray(d) ? d : d.combos || [];
}

async function putCombo(token, combo) {
  const r = await fetch(`${BASE}/api/combos/${combo.id}`, {
    method: 'PUT',
    headers: { cookie: `auth_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: combo.name, models: combo.models })
  });
  return r.ok;
}

// Testa um modelo com request minimo. Retorna true se saudavel.
async function testModel(model) {
  if (!API_KEY) {
    // Sem key → usa o painel admin pra checar state do provider seria complexo;
    // assume saudavel pra nao reordenar sem evidencia.
    return true;
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const r = await fetch(`${BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        stream: false
      }),
      signal: controller.signal
    });
    clearTimeout(t);
    if (!r.ok) return false;
    const d = await r.json();
    return !d.error;
  } catch {
    clearTimeout(t);
    return false;
  }
}

async function main() {
  console.log(`${C.bld}JEV 9Router Health — ${CHECK_ONLY ? 'diagnóstico' : 'testa e reordena'}${C.reset}\n`);
  let token;
  try { token = await login(); }
  catch { console.log(`${C.red}✗${C.reset} Não consegui logar no 9router em ${BASE}. Verifique NINE_ROUTER_PASS.`); process.exit(1); }

  const combos = await getCombos(token);
  console.log(`${C.dim}${combos.length} combos encontrados${C.reset}\n`);

  let changed = 0;
  for (const combo of combos) {
    const models = combo.models || [];
    if (models.length === 0) continue;

    // Testa só os primeiros modelos (headroom) — o que importa é o topo do combo
    // estar saudável. Se o topo funciona, o 9router cai nele e o fallback cobre o resto.
    const headroom = 4;
    const testable = models.slice(0, headroom);
    const results = [];
    const seen = new Set();
    for (const m of testable) {
      if (seen.has(m)) continue;
      seen.add(m);
      const ok = await testModel(m);
      results.push([m, ok]);
      process.stdout.write(`  ${ok ? C.grn+'✓' : C.red+'✗'}${C.reset} ${m}${ok ? '' : C.dim+' (falhou — movendo pro fim)'+C.reset}\n`);
    }

    // Reordena: modelos testados e saudáveis primeiro, depois o resto, quebrados pro fim.
    const okModels = results.filter(([, ok]) => ok).map(([m]) => m);
    const badModels = results.filter(([, ok]) => !ok).map(([m]) => m);
    const rest = models.filter(m => !seen.has(m));
    const reordered = [...okModels, ...rest, ...badModels];

    if (JSON.stringify(reordered) !== JSON.stringify(models) && !CHECK_ONLY && badModels.length > 0) {
      const before = models.slice(0, 3).join(', ');
      const after = reordered.slice(0, 3).join(', ');
      const ok = await putCombo(token, { ...combo, models: reordered });
      if (ok) {
        changed++;
        console.log(`  ${C.yel}→ ${combo.name}: reordenado${C.reset}  (antes: ${before} · depois: ${after})`);
      }
    } else if (CHECK_ONLY && badModels.length > 0) {
      console.log(`  ${C.yel}⚠ ${combo.name}: ${badModels.length} modelo(s) quebrado(s) — precisa reordenar${C.reset}`);
    }
    console.log('');
  }

  if (CHECK_ONLY) {
    console.log(`${C.dim}Modo diagnóstico: nada foi alterado. Rode sem --check pra reordenar.${C.reset}`);
  } else {
    console.log(`${changed > 0 ? C.grn + `✅ ${changed} combo(s) reordenado(s).` : C.grn + '✅ Todos os combos já estão com modelos saudáveis na frente.'}${C.reset}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });