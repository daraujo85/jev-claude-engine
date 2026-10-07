/**
 * JEV Visual Plan & Execution Flow Tracker
 *
 * Transforma planos de desenvolvimento em fluxos visuais interativos usando Archify,
 * acompanhando em tempo real cada etapa (Planejado, Em Execução, Em Teste, Concluído).
 * Gera link público temporário com senha via Cloudflare Quick Tunnel sem necessidade de credenciais.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync, spawn, spawnSync } from 'node:child_process';
import { loadConfig } from './jev-config.js';

export function resolveArchifyBin() {
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', 'archify'),
    path.join(os.homedir(), '.agents', 'skills', 'archify', 'bin', 'archify.mjs'),
    path.join(os.homedir(), '.claude', 'skills', 'archify', 'bin', 'archify.mjs'),
    path.join(os.homedir(), 'Documents', 'projects', 'pratadigital-ai-skills-admin', 'prata', 'archify', 'bin', 'archify.mjs')
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  try {
    const which = execSync('which archify', { encoding: 'utf-8' }).trim();
    if (which) return which;
  } catch {}

  return 'archify';
}

export function checkCloudflared() {
  try {
    const which = execSync('which cloudflared', { encoding: 'utf-8' }).trim();
    if (which) {
      let version = '';
      try {
        version = execSync(`${which} --version`, { encoding: 'utf-8' }).trim().split('\n')[0];
      } catch {}
      return { installed: true, path: which, version, zero_credentials: true };
    }
  } catch {}
  return { installed: false, path: null, version: null, zero_credentials: true };
}

export function parsePlanSteps(input) {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== 'string') return [];

  const lines = input.split('\n');
  const steps = [];
  let index = 1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Reconhece checkboxes markdown: - [x], - [/], - [t], - [ ] ou listas numeradas
    const checkMatch = line.match(/^[-*]\s*\[([ xX/tT>~])\]\s*(.+)$/);
    const numMatch = line.match(/^(\d+)[\.\)]\s*(?:\[([ xX/tT>~])\])?\s*(.+)$/);

    if (checkMatch) {
      const mark = checkMatch[1].toLowerCase();
      const text = checkMatch[2].trim();
      let status = 'planned';
      if (mark === 'x') status = 'done';
      else if (mark === '/' || mark === '>') status = 'in_progress';
      else if (mark === 't') status = 'testing';

      steps.push(createStepObject(index++, text, status));
    } else if (numMatch) {
      const mark = (numMatch[2] || '').toLowerCase();
      const text = numMatch[3].trim();
      let status = 'planned';
      const textLower = text.toLowerCase();

      if (mark === 'x' || textLower.includes('(done)') || textLower.includes('(concluído)') || textLower.includes('(concluido)')) {
        status = 'done';
      } else if (mark === '/' || mark === '>' || textLower.includes('(in progress)') || textLower.includes('(em execução)') || textLower.includes('(em execucao)')) {
        status = 'in_progress';
      } else if (mark === 't' || textLower.includes('(testing)') || textLower.includes('(em teste)') || textLower.includes('(testando)')) {
        status = 'testing';
      }

      steps.push(createStepObject(index++, cleanStatusTags(text), status));
    } else if (line.startsWith('### ') || line.startsWith('## ') || line.startsWith('Task:')) {
      // Cabeçalho de sub-tarefa
      const clean = line.replace(/^[#]+\s*/, '').replace(/^Task:\s*/i, '').trim();
      if (clean.length > 2) {
        steps.push(createStepObject(index++, clean, 'planned'));
      }
    }
  }

  return steps;
}

function cleanStatusTags(text) {
  return text
    .replace(/\s*\((done|concluído|concluido|in progress|em execução|em execucao|testing|em teste|testando|pending|a fazer)\)\s*$/i, '')
    .trim();
}

function createStepObject(index, rawTitle, status) {
  let title = rawTitle.replace(/^\d+[\.\)]\s*/, '').trim();
  let desc = '';

  const splitMatch = title.match(/^([^:\-–]+)[:\-–]\s*(.+)$/);
  if (splitMatch && splitMatch[1].length < 24) {
    title = splitMatch[1].trim();
    desc = splitMatch[2].trim();
  }

  // Encurta o título se for longo para manter legibilidade visual
  if (title.length > 18) {
    desc = desc ? `${title} — ${desc}` : title;
    title = title.substring(0, 16) + '...';
  }

  return {
    id: `step_${index}`,
    index,
    title,
    description: desc || title,
    status: status || 'planned'
  };
}

export function buildArchifyWorkflowCandidate(title, steps, relOutput = 'visual-plan.html') {
  const safeSteps = Array.isArray(steps) && steps.length > 0 ? steps : [
    { id: 'step_1', index: 1, title: 'Planejamento Inicial', description: 'Definição de escopo e tarefas', status: 'done' },
    { id: 'step_2', index: 2, title: 'Implementação Core', description: 'Desenvolvimento das regras centrais', status: 'in_progress' },
    { id: 'step_3', index: 3, title: 'Testes de Cobertura', description: 'Validação de testes unitários e de integração', status: 'testing' },
    { id: 'step_4', index: 4, title: 'Entrega & Fechamento', description: 'Deploy e verificação final', status: 'planned' }
  ];

  const total = safeSteps.length;
  const doneCount = safeSteps.filter(s => s.status === 'done').length;
  const inProgCount = safeSteps.filter(s => s.status === 'in_progress').length;
  const testCount = safeSteps.filter(s => s.status === 'testing').length;
  const plannedCount = safeSteps.filter(s => s.status === 'planned').length;
  const pct = Math.round((doneCount / total) * 100);

  const lanes = [
    { id: 'lane_planned', label: '📋 Planejado' },
    { id: 'lane_exec', label: '⚡ Em Execução' },
    { id: 'lane_test', label: '🧪 Em Teste', variant: 'exception' },
    { id: 'lane_done', label: '✅ Concluído' }
  ];

  // Schema do Archify limita colunas a no máximo 5 (0..5)
  const totalCols = Math.min(total, 6);
  const colStep = (idx) => Math.min(Math.floor((idx / total) * totalCols), 5);

  const phases = [
    { id: 'phase_plan', label: '1. Mapeamento', fromCol: 0, toCol: 1 },
    { id: 'phase_exec', label: '2. Execução', fromCol: 2, toCol: 3, variant: 'emphasis' },
    { id: 'phase_eval', label: '3. Validação & Entrega', fromCol: 4, toCol: 5, variant: 'dashed' }
  ];

  const nodes = safeSteps.map((s, idx) => {
    let lane = 'lane_planned';
    let sublabel = '⏳ Pendente';
    let type = 'external';

    if (s.status === 'done') {
      lane = 'lane_done';
      sublabel = '✅ Concluído';
      type = 'frontend';
    } else if (s.status === 'in_progress') {
      lane = 'lane_exec';
      sublabel = '⚡ Em Execução';
      type = 'backend';
    } else if (s.status === 'testing') {
      lane = 'lane_test';
      sublabel = '🧪 Em Teste';
      type = 'security';
    }

    // Distribui os nós confortavelmente ao longo das 6 colunas (0..5)
    const col = total > 1 ? Math.min(5, Math.round((idx / (total - 1)) * 5)) : 2;

    return {
      id: s.id,
      lane,
      col,
      type,
      label: s.title,
      sublabel,
      width: 140
    };
  });

  const mainPath = safeSteps.map(s => s.id);
  const edges = [];
  for (let i = 0; i < safeSteps.length - 1; i++) {
    const from = safeSteps[i];
    const to = safeSteps[i + 1];
    const isDone = from.status === 'done';
    edges.push({
      id: `e_${from.id}_to_${to.id}`,
      from: from.id,
      to: to.id,
      label: isDone ? 'concluído' : 'avança',
      variant: isDone ? 'emphasis' : 'default'
    });
  }

  const cards = [
    {
      dot: pct === 100 ? 'emerald' : (pct >= 50 ? 'cyan' : 'amber'),
      title: 'Progresso da Execução',
      items: [
        `Progresso geral: ${pct}% (${doneCount}/${total} etapas)`,
        `⚡ Em Execução: ${inProgCount} | 🧪 Em Teste: ${testCount} | ⏳ Pendentes: ${plannedCount}`
      ]
    },
    {
      dot: 'cyan',
      title: 'Detalhamento das Etapas',
      items: safeSteps.map(s => {
        const symbol = s.status === 'done' ? '✅' : (s.status === 'in_progress' ? '⚡' : (s.status === 'testing' ? '🧪' : '⏳'));
        return `${symbol} ${s.title}: ${s.description}`;
      }).slice(0, 5)
    }
  ];

  return {
    schema_version: 2,
    diagram_type: 'workflow',
    meta: {
      title: title || 'Plano de Desenvolvimento & Execução',
      animation: 'trace',
      quality_profile: 'showcase',
      output: relOutput
    },
    lanes,
    phases,
    mainPath,
    nodes,
    edges,
    cards
  };
}

export function renderVisualPlan(candidateJsonPath, outputHtmlPath) {
  const archifyBin = resolveArchifyBin();
  const res = spawnSync('node', [
    archifyBin,
    'finalize',
    'workflow',
    candidateJsonPath,
    outputHtmlPath,
    '--quality',
    'showcase',
    '--json'
  ], {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024
  });

  let parsed = null;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {}

  if (parsed && parsed.ok && fs.existsSync(outputHtmlPath)) {
    return { success: true, htmlPath: outputHtmlPath, artifact: parsed.artifact };
  }

  // Fallback: compila diretamente com archify render para garantir entrega do HTML
  const renderRes = spawnSync('node', [
    archifyBin,
    'render',
    'workflow',
    candidateJsonPath,
    outputHtmlPath
  ], {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024
  });

  if (fs.existsSync(outputHtmlPath)) {
    return { success: true, htmlPath: outputHtmlPath, artifact: { path: outputHtmlPath } };
  }

  return {
    success: false,
    error: parsed?.diagnostics?.[0]?.message || renderRes.stderr || 'Falha ao compilar com Archify',
    details: parsed
  };
}

export function startVisualPlanServer(targetHtmlPath, options = {}) {
  const targetAbs = path.resolve(targetHtmlPath);
  if (!fs.existsSync(targetAbs)) {
    throw new Error(`Arquivo de visualização não encontrado: ${targetAbs}`);
  }

  const baseDir = path.dirname(targetAbs);
  const stem = path.basename(targetAbs, '.html');
  const shareDir = path.join(baseDir, `.share-${stem}`);
  fs.mkdirSync(shareDir, { recursive: true });

  const port = options.port || (Math.floor(Math.random() * 5000) + 20000);
  const password = crypto.randomBytes(9).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  const secret = crypto.randomBytes(32).toString('hex');

  // Localiza ou usa o servidor python embutido
  const serverScript = path.join(__dirname(), '..', 'skills', 'jev-visual-plan', 'plan-server.py');

  const serverLog = fs.openSync(path.join(shareDir, 'server.log'), 'a');
  const env = {
    ...process.env,
    SHARE_TARGET: targetAbs,
    ARTIFACT_PASSWORD_SHA256: hash,
    ARTIFACT_SESSION_SECRET: secret,
    PORT: String(port)
  };

  const serverProc = spawn('python3', ['-u', serverScript], {
    env,
    detached: true,
    stdio: ['ignore', serverLog, serverLog]
  });
  serverProc.unref();

  const cf = checkCloudflared();
  let tunnelUrl = '';
  let tunnelProc = null;

  if (cf.installed) {
    const tunnelLogPath = path.join(shareDir, 'tunnel.log');
    const tunnelLog = fs.openSync(tunnelLogPath, 'a');

    tunnelProc = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${port}`], {
      detached: true,
      stdio: ['ignore', tunnelLog, tunnelLog]
    });
    tunnelProc.unref();

    // Aguarda até 25s pela URL gerada
    for (let i = 0; i < 25; i++) {
      try {
        const content = fs.readFileSync(tunnelLogPath, 'utf-8');
        const match = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match) {
          tunnelUrl = match[0];
          break;
        }
      } catch {}
      execSync('sleep 1');
    }
  }

  const localUrl = `http://127.0.0.1:${port}`;
  const finalUrl = tunnelUrl || localUrl;

  fs.writeFileSync(path.join(shareDir, 'server.pid'), String(serverProc.pid));
  if (tunnelProc?.pid) fs.writeFileSync(path.join(shareDir, 'tunnel.pid'), String(tunnelProc.pid));
  fs.writeFileSync(path.join(shareDir, 'server.port'), String(port));
  fs.writeFileSync(path.join(shareDir, 'tunnel.url'), finalUrl);

  return {
    url: finalUrl,
    localUrl,
    password,
    port,
    cloudflare: Boolean(tunnelUrl),
    serverPid: serverProc.pid,
    tunnelPid: tunnelProc?.pid || null
  };
}

export function stopVisualPlanServer(targetHtmlPath) {
  const targetAbs = path.resolve(targetHtmlPath);
  const baseDir = fs.statSync(targetAbs).isDirectory() ? targetAbs : path.dirname(targetAbs);
  const stem = fs.statSync(targetAbs).isDirectory() ? '' : path.basename(targetAbs, '.html');
  const shareDir = stem ? path.join(baseDir, `.share-${stem}`) : path.join(baseDir, '.share');

  if (!fs.existsSync(shareDir)) return false;

  try {
    const sPid = fs.readFileSync(path.join(shareDir, 'server.pid'), 'utf-8').trim();
    if (sPid) process.kill(Number(sPid));
  } catch {}

  try {
    const tPid = fs.readFileSync(path.join(shareDir, 'tunnel.pid'), 'utf-8').trim();
    if (tPid) process.kill(Number(tPid));
  } catch {}

  try {
    fs.rmSync(shareDir, { recursive: true, force: true });
  } catch {}

  return true;
}

function __dirname() {
  return path.dirname(new URL(import.meta.url).pathname);
}
