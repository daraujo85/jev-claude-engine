#!/usr/bin/env node
/**
 * JEV Vision Bridge — describe an image via a vision-capable model on the
 * 9Router gateway, returning text for a non-vision model to consume.
 *
 * Sources:
 *   - local image path
 *   - WhatsApp message-id (downloads full media via wpp.sh get-media)
 *   - URL (fetched locally)
 *
 * Models (failover in order):
 *   ag/gemini-3.8-flash-high → ag/gemini-3-flash → cc/claude-sonnet-5 → claude-tools
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.NINE_ROUTER_URL || 'http://localhost:20128';
const WPP_SH = path.join(os.homedir(), '.claude', 'skills', 'whatsapp-message', 'wpp.sh');
const DEFAULT_PROMPT = 'Descreva EXATAMENTE o que esta imagem mostra. Se for erro/terminal/screenshot, transcreva todo o texto visível, o erro completo e qualquer stack trace.';

// Vision-capable models, in failover order.
const VISION_MODELS = [
  'ag/gemini-3.8-flash-high',
  'ag/gemini-3-flash',
  'cc/claude-sonnet-5',
  'claude-tools'
];

function apiKey() {
  const fromEnv = process.env.ANTHROPIC_AUTH_TOKEN;
  if (fromEnv) return fromEnv;
  try {
    const f = path.join(os.homedir(), '.claude', 'settings.json');
    if (fs.existsSync(f)) {
      const k = JSON.parse(fs.readFileSync(f, 'utf-8'))?.env?.ANTHROPIC_AUTH_TOKEN;
      if (k) return k;
    }
  } catch { /* fallthrough */ }
  try {
    const f = path.join(os.homedir(), '.jev', 'config.json');
    if (fs.existsSync(f)) {
      const k = JSON.parse(fs.readFileSync(f, 'utf-8'))?.router?.api_key;
      if (k) return k;
    }
  } catch { /* fallthrough */ }
  return '';
}

function readStdin() {
  return new Promise(res => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { buf += c; });
    process.stdin.on('end', () => res(buf));
  });
}

async function downloadWppMedia(msgid) {
  if (!fs.existsSync(WPP_SH)) {
    throw new Error(`wpp.sh não encontrado em ${WPP_SH}`);
  }
  const out = execSync(`bash ${WPP_SH} get-media "${msgid}"`, { encoding: 'utf-8' });
  const [file, mime, bytes] = out.trim().split('\t');
  if (!file || !fs.existsSync(file)) throw new Error(`get-media falhou: ${out}`);
  return { file, mime, bytes };
}

async function fetchUrl(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ao baixar ${url}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const mime = resp.headers.get('content-type') || 'image/jpeg';
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const tmp = path.join(os.tmpdir(), `jev-vision-${Date.now()}.${ext}`);
  fs.writeFileSync(tmp, buf);
  return { file: tmp, mime, bytes: String(buf.length) };
}

// Streaming-safe SSE parser for /v1/messages (anthropic-compatible).
export function parseAnthropicStream(raw) {
  const text = [];
  for (const line of raw.split('\n')) {
    const l = line.trim();
    if (!l.startsWith('data:')) continue;
    try {
      const d = JSON.parse(l.slice(5));
      if (d.type === 'content_block_delta' && d.delta?.type === 'text_delta') {
        text.push(d.delta.text);
      }
      if (d.type === 'message_stop') break;
    } catch { /* skip */ }
  }
  return text.join('');
}

async function askVision(model, imagePath, mime, prompt) {
  const key = apiKey();
  if (!key) throw new Error('API key do 9Router não encontrada (ANTHROPIC_AUTH_TOKEN ou ~/.jev/config.json)');

  const b64 = fs.readFileSync(imagePath).toString('base64');
  const mediaType = mime || 'image/jpeg';
  const body = {
    model,
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } }
      ]
    }]
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120000);
  let resp;
  try {
    resp = await fetch(`${BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
  } finally {
    clearTimeout(t);
  }

  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    // 400 with model_not_found/credentials → try next model
    const e = new Error(`HTTP ${resp.status} para ${model}: ${err.slice(0, 200)}`);
    e.status = resp.status;
    throw e;
  }

  const raw = await resp.text();
  if (!raw.includes('data:')) {
    try {
      const j = JSON.parse(raw);
      if (j.content) return j.content.map(b => b.type === 'text' ? b.text : '').join('');
      return raw.slice(0, 3000);
    } catch {
      return raw.slice(0, 3000);
    }
  }
  return parseAnthropicStream(raw);
}

async function main() {
  const args = process.argv.slice(2);
  let image = '';
  let prompt = DEFAULT_PROMPT;
  let modelFilter = '';

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--prompt' || a === '-p') prompt = args[++i];
    else if (a === '--model' || a === '-m') modelFilter = args[++i];
    else if (a === '--wpp') image = args[++i];
    else if (a === '--url') image = args[++i];
    else image = a;
  }

  if (!image) {
    const stdin = await readStdin();
    if (stdin.trim()) image = stdin.trim();
  }
  if (!image) {
    console.error('Uso: node vision.js <imagem|--wpp msgid|--url url> [--prompt "..."] [--model M]');
    process.exit(1);
  }

  let file, mime, bytes;
  try {
    if (args.includes('--wpp')) {
      ({ file, mime, bytes } = await downloadWppMedia(image));
    } else if (args.includes('--url') || /^https?:\/\//.test(image)) {
      ({ file, mime, bytes } = await fetchUrl(image));
    } else {
      if (!fs.existsSync(image)) throw new Error(`Arquivo não encontrado: ${image}`);
      file = image;
      mime = path.extname(image).toLowerCase() === '.png' ? 'image/png' : path.extname(image).toLowerCase() === '.webp' ? 'image/webp' : 'image/jpeg';
      bytes = String(fs.statSync(image).size);
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }

  const models = modelFilter ? [modelFilter] : VISION_MODELS;
  let lastErr = null;
  for (const model of models) {
    try {
      const text = await askVision(model, file, mime, prompt);
      console.log(`🧠 [JEV Vision] modelo: ${model}`);
      console.log(`📦 ${bytes} bytes`);
      console.log('');
      console.log(text.trim());
      return;
    } catch (e) {
      lastErr = e;
      process.stderr.write(`⚠ ${model} falhou (${e.status || e.message.slice(0, 80)}) — tentando próximo...\n`);
    }
  }
  console.error(`❌ Todos os modelos de visão falharam: ${lastErr?.message}`);
  process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith('vision.js')) {
  main().catch(e => { console.error('Erro:', e.message); process.exit(1); });
}