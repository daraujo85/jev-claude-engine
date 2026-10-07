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
  let currentStep = null;
  let index = 1;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Reconhece checkboxes markdown: - [x], - [/], - [t], - [ ] ou listas numeradas
    const checkMatch = trimmed.match(/^[-*]\s*\[([ xX/tT>~])\]\s*(.+)$/);
    const numMatch = trimmed.match(/^(\d+)[\.\)]\s*(?:\[([ xX/tT>~])\])?\s*(.+)$/);
    const headerMatch = trimmed.match(/^(?:###|##|Task:)\s*(.+)$/i);

    if (checkMatch) {
      const mark = checkMatch[1].toLowerCase();
      const text = checkMatch[2].trim();
      let status = 'planned';
      if (mark === 'x') status = 'done';
      else if (mark === '/' || mark === '>') status = 'in_progress';
      else if (mark === 't') status = 'testing';

      currentStep = createStepObject(index++, text, status);
      steps.push(currentStep);
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

      currentStep = createStepObject(index++, cleanStatusTags(text), status);
      steps.push(currentStep);
    } else if (headerMatch) {
      const clean = headerMatch[1].trim();
      if (clean.length > 2) {
        currentStep = createStepObject(index++, clean, 'planned');
        steps.push(currentStep);
      }
    } else if (currentStep) {
      // Linha associada ao passo atual (sub-item, detalhe, o que foi feito ou próximos passos)
      const isIndented = /^\s{2,}/.test(rawLine) || /^[\t]/.test(rawLine);
      const isBullet = /^[-*•+]\s*(.+)$/.test(trimmed);
      const isDetailLine = /^(o que foi feito|feito|done|em execução|em execucao|em andamento|in progress|testando|testing|próximos passos|proximos passos|next steps|detalhes|details):/i.test(trimmed);

      if (isIndented || isBullet || isDetailLine) {
        const cleanContent = trimmed.replace(/^[-*•+]\s*/, '').trim();

        if (/^(o que foi feito|feito|done|concluído|concluido):/i.test(cleanContent)) {
          const detail = cleanContent.replace(/^(o que foi feito|feito|done|concluído|concluido):\s*/i, '').trim();
          currentStep.doneDetails = currentStep.doneDetails ? `${currentStep.doneDetails}; ${detail}` : detail;
          currentStep.subItems.push(`Feito: ${detail}`);
        } else if (/^(em execução|em execucao|em andamento|in progress|testando|testing):/i.test(cleanContent)) {
          const detail = cleanContent.replace(/^(em execução|em execucao|em andamento|in progress|testando|testing):\s*/i, '').trim();
          currentStep.inProgressDetails = currentStep.inProgressDetails ? `${currentStep.inProgressDetails}; ${detail}` : detail;
          currentStep.subItems.push(`Em andamento: ${detail}`);
        } else if (/^(próximos passos|proximos passos|next steps|a fazer|planejado):/i.test(cleanContent)) {
          const detail = cleanContent.replace(/^(próximos passos|proximos passos|next steps|a fazer|planejado):\s*/i, '').trim();
          currentStep.nextSteps = currentStep.nextSteps ? `${currentStep.nextSteps}; ${detail}` : detail;
          currentStep.subItems.push(`Próximo: ${detail}`);
        } else if (/^(detalhes|details):/i.test(cleanContent)) {
          const detail = cleanContent.replace(/^(detalhes|details):\s*/i, '').trim();
          currentStep.description = `${currentStep.description} — ${detail}`;
          currentStep.subItems.push(detail);
        } else {
          currentStep.subItems.push(cleanContent);
          if (currentStep.status === 'done' && !currentStep.doneDetails) {
            currentStep.doneDetails = cleanContent;
          } else if (currentStep.status === 'planned' && !currentStep.nextSteps) {
            currentStep.nextSteps = cleanContent;
          }
        }
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

function createStepObject(index, rawTitle, status, extra = {}) {
  let title = rawTitle.replace(/^\d+[\.\)]\s*/, '').trim();
  let fullTitle = title;
  let desc = extra.description || '';
  let doneDetails = extra.doneDetails || '';
  let inProgressDetails = extra.inProgressDetails || '';
  let nextSteps = extra.nextSteps || '';
  let subItems = Array.isArray(extra.subItems) ? [...extra.subItems] : [];

  // Suporte a separadores inline com pipes ou travessões (ex: "Auth JWT | Feito: Tokens e rotas")
  if (title.includes('|')) {
    const parts = title.split('|').map(p => p.trim());
    title = parts[0];
    fullTitle = title;
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (/^(feito|done|o que foi feito|concluído|concluido):/i.test(part)) {
        doneDetails = part.replace(/^(feito|done|o que foi feito|concluído|concluido):\s*/i, '').trim();
      } else if (/^(em execução|em execucao|em andamento|in progress|testando|testing):/i.test(part)) {
        inProgressDetails = part.replace(/^(em execução|em execucao|em andamento|in progress|testando|testing):\s*/i, '').trim();
      } else if (/^(próximos passos|proximos passos|next steps|a fazer|planejado):/i.test(part)) {
        nextSteps = part.replace(/^(próximos passos|proximos passos|next steps|a fazer|planejado):\s*/i, '').trim();
      } else if (/^(detalhes|details):/i.test(part)) {
        desc = part.replace(/^(detalhes|details):\s*/i, '').trim();
      } else if (!desc) {
        desc = part;
      }
    }
  }

  const splitMatch = title.match(/^([^:\-–]+)[:\-–]\s*(.+)$/);
  if (splitMatch && splitMatch[1].length < 24) {
    title = splitMatch[1].trim();
    fullTitle = title;
    if (!desc) desc = splitMatch[2].trim();
  }

  // Encurta o título para caber no nó visual sem overflow de texto
  if (title.length > 18) {
    if (!desc) desc = fullTitle;
    title = title.substring(0, 16) + '...';
  }

  return {
    id: `step_${index}`,
    index,
    title,
    fullTitle: extra.fullTitle || fullTitle,
    description: desc || fullTitle,
    status: status || 'planned',
    doneDetails,
    inProgressDetails,
    nextSteps,
    subItems
  };
}

export function buildArchifyWorkflowCandidate(title, steps, relOutput = 'visual-plan.html') {
  const safeSteps = Array.isArray(steps) && steps.length > 0 ? steps : [
    { id: 'step_1', index: 1, title: 'Planejamento Inicial', description: 'Definição de escopo e arquitetura', status: 'done', doneDetails: 'Escopo mapeado e requisitos definidos' },
    { id: 'step_2', index: 2, title: 'Implementação Core', description: 'Desenvolvimento das regras centrais', status: 'in_progress', inProgressDetails: 'Construindo models e rotas' },
    { id: 'step_3', index: 3, title: 'Testes de Cobertura', description: 'Validação de testes unitários e de integração', status: 'testing', inProgressDetails: 'Executando bateria de testes' },
    { id: 'step_4', index: 4, title: 'Entrega & Fechamento', description: 'Deploy e verificação final', status: 'planned', nextSteps: 'Deploy em staging e homologação' }
  ];

  const total = safeSteps.length;
  const doneSteps = safeSteps.filter(s => s.status === 'done');
  const inProgSteps = safeSteps.filter(s => s.status === 'in_progress');
  const testSteps = safeSteps.filter(s => s.status === 'testing');
  const plannedSteps = safeSteps.filter(s => s.status === 'planned');

  const doneCount = doneSteps.length;
  const inProgCount = inProgSteps.length;
  const testCount = testSteps.length;
  const plannedCount = plannedSteps.length;
  const pct = Math.round((doneCount / total) * 100);

  const lanes = [
    { id: 'lane_planned', label: '📋 Planejado' },
    { id: 'lane_exec', label: '⚡ Em Execução' },
    { id: 'lane_test', label: '🧪 Em Teste', variant: 'exception' },
    { id: 'lane_done', label: '✅ Concluído' }
  ];

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
      const detail = s.doneDetails || s.description || 'Concluído';
      sublabel = `✅ ${detail.length > 20 ? detail.substring(0, 18) + '...' : detail}`;
      type = 'frontend';
    } else if (s.status === 'in_progress') {
      lane = 'lane_exec';
      const detail = s.inProgressDetails || s.description || 'Em Execução';
      sublabel = `⚡ ${detail.length > 20 ? detail.substring(0, 18) + '...' : detail}`;
      type = 'backend';
    } else if (s.status === 'testing') {
      lane = 'lane_test';
      const detail = s.inProgressDetails || s.description || 'Em Teste';
      sublabel = `🧪 ${detail.length > 20 ? detail.substring(0, 18) + '...' : detail}`;
      type = 'security';
    } else {
      const detail = s.nextSteps || s.description || 'Pendente';
      sublabel = `⏳ ${detail.length > 20 ? detail.substring(0, 18) + '...' : detail}`;
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
      tag: `Etapa ${idx + 1}/${total}`,
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

  // --- CARDS COM DETALHES DE CADA ETAPA, O QUE FOI FEITO E PRÓXIMOS PASSOS ---
  const cards = [];

  // Card 1: Progresso Geral
  const progressItems = [
    `Progresso geral: ${pct}% (${doneCount}/${total} etapas concluídas)`,
    `⚡ Em Execução: ${inProgCount} | 🧪 Em Teste: ${testCount} | ⏳ Pendentes: ${plannedCount}`
  ];
  if (pct === 100) {
    progressItems.push('🎉 Todas as etapas foram entregues com sucesso!');
  } else if (inProgCount > 0 || testCount > 0) {
    const currentActive = [...inProgSteps, ...testSteps].map(s => s.fullTitle || s.title).join(', ');
    progressItems.push(`🎯 Foco ativo: ${currentActive}`);
  } else if (plannedCount > 0) {
    progressItems.push(`🔜 Próxima etapa a iniciar: ${plannedSteps[0].fullTitle || plannedSteps[0].title}`);
  }
  cards.push({
    dot: pct === 100 ? 'emerald' : (pct >= 50 ? 'cyan' : 'amber'),
    title: 'Progresso da Execução',
    items: progressItems
  });

  // Card 2: O Que Já Foi Feito (Concluído)
  const doneItems = [];
  if (doneSteps.length > 0) {
    for (const s of doneSteps) {
      const detail = s.doneDetails || s.description || 'Concluído com sucesso';
      doneItems.push(`✅ [${s.fullTitle || s.title}]: ${detail}`);
      if (Array.isArray(s.subItems) && s.subItems.length > 0) {
        for (const sub of s.subItems.slice(0, 3)) {
          doneItems.push(`   • ${sub}`);
        }
      }
    }
  } else {
    doneItems.push('ℹ️ Nenhuma etapa concluída até o momento. Aguardando execução.');
  }
  cards.push({
    dot: 'emerald',
    title: 'O Que Já Foi Feito',
    items: doneItems
  });

  // Card 3: Etapas em Andamento & Testes
  const activeItems = [];
  const activeSteps = [...inProgSteps, ...testSteps];
  if (activeSteps.length > 0) {
    for (const s of activeSteps) {
      const isTest = s.status === 'testing';
      const icon = isTest ? '🧪' : '⚡';
      const label = isTest ? 'Em Teste' : 'Em Execução';
      const detail = s.inProgressDetails || s.description || label;
      activeItems.push(`${icon} [${s.fullTitle || s.title}]: ${detail}`);
      if (Array.isArray(s.subItems) && s.subItems.length > 0) {
        for (const sub of s.subItems.slice(0, 3)) {
          activeItems.push(`   • ${sub}`);
        }
      }
    }
  } else {
    activeItems.push('ℹ️ Nenhuma etapa em execução ou teste no momento.');
  }
  cards.push({
    dot: testCount > 0 ? 'violet' : (inProgCount > 0 ? 'amber' : 'slate'),
    title: 'Em Execução & Testes',
    items: activeItems
  });

  // Card 4: Próximos Passos (Planejado / Backlog)
  const nextItems = [];
  if (plannedSteps.length > 0) {
    for (const s of plannedSteps) {
      const detail = s.nextSteps || s.description || 'Pendente de início';
      nextItems.push(`⏳ [${s.fullTitle || s.title}]: ${detail}`);
      if (Array.isArray(s.subItems) && s.subItems.length > 0) {
        for (const sub of s.subItems.slice(0, 2)) {
          nextItems.push(`   • ${sub}`);
        }
      }
    }
  } else {
    nextItems.push('🎉 Todas as etapas foram finalizadas — sem próximos passos pendentes.');
  }
  cards.push({
    dot: 'cyan',
    title: 'Próximos Passos',
    items: nextItems
  });

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

export function updatePlanStep(targetDirOrFile, stepId, newStatus, options = {}) {
  const targetAbs = path.resolve(targetDirOrFile);
  const dir = fs.statSync(targetAbs).isDirectory() ? targetAbs : path.dirname(targetAbs);

  const stepsJsonPath = path.join(dir, 'steps.json');
  const candidateJsonPath = path.join(dir, 'candidate.json');
  const htmlPath = path.join(dir, 'plan.html');

  let steps = [];
  let title = 'Plano de Desenvolvimento & Execução';

  if (fs.existsSync(stepsJsonPath)) {
    try {
      steps = JSON.parse(fs.readFileSync(stepsJsonPath, 'utf-8'));
    } catch {}
  }

  let candidateData = null;
  if (fs.existsSync(candidateJsonPath)) {
    try {
      candidateData = JSON.parse(fs.readFileSync(candidateJsonPath, 'utf-8'));
      if (candidateData?.meta?.title) title = candidateData.meta.title;
    } catch {}
  }

  // Se steps.json ainda não existia, reconstrói steps a partir de candidate.nodes
  if (!Array.isArray(steps) || steps.length === 0) {
    if (candidateData?.nodes) {
      steps = candidateData.nodes.map((n, idx) => {
        let status = 'planned';
        if (n.lane === 'lane_done') status = 'done';
        else if (n.lane === 'lane_exec') status = 'in_progress';
        else if (n.lane === 'lane_test') status = 'testing';
        return {
          id: n.id,
          index: idx + 1,
          title: n.label,
          description: n.label,
          status,
          doneDetails: status === 'done' ? (n.sublabel || '') : '',
          inProgressDetails: (status === 'in_progress' || status === 'testing') ? (n.sublabel || '') : '',
          nextSteps: status === 'planned' ? (n.sublabel || '') : '',
          subItems: []
        };
      });
    }
  }

  let matchedStep = steps.find(s =>
    s.id === stepId ||
    s.id === `step_${stepId}` ||
    s.title?.toLowerCase() === String(stepId).toLowerCase() ||
    String(s.index) === String(stepId)
  );

  if (!matchedStep) {
    throw new Error(`Etapa "${stepId}" não encontrada no plano.`);
  }

  const validStatuses = ['planned', 'in_progress', 'testing', 'done'];
  if (newStatus && !validStatuses.includes(newStatus)) {
    throw new Error(`Status inválido "${newStatus}". Opções válidas: ${validStatuses.join(', ')}`);
  }

  if (newStatus) {
    matchedStep.status = newStatus;
  }

  if (options.details) {
    if (matchedStep.status === 'done') {
      matchedStep.doneDetails = options.details;
    } else if (matchedStep.status === 'in_progress' || matchedStep.status === 'testing') {
      matchedStep.inProgressDetails = options.details;
    } else if (matchedStep.status === 'planned') {
      matchedStep.nextSteps = options.details;
    }
    matchedStep.description = options.details;
  }

  if (options.doneDetails) matchedStep.doneDetails = options.doneDetails;
  if (options.inProgressDetails) matchedStep.inProgressDetails = options.inProgressDetails;
  if (options.nextSteps) matchedStep.nextSteps = options.nextSteps;

  if (options.subItem) {
    if (!Array.isArray(matchedStep.subItems)) matchedStep.subItems = [];
    matchedStep.subItems.push(options.subItem);
  }

  // Persiste steps.json
  fs.writeFileSync(stepsJsonPath, JSON.stringify(steps, null, 2), 'utf-8');

  // Reconstrói candidate.json
  const updatedCandidate = buildArchifyWorkflowCandidate(title, steps, path.basename(htmlPath));
  fs.writeFileSync(candidateJsonPath, JSON.stringify(updatedCandidate, null, 2), 'utf-8');

  // Re-renderiza o HTML se ele já existir ou se o candidate existir
  let renderResult = { success: false };
  if (fs.existsSync(htmlPath) || fs.existsSync(candidateJsonPath)) {
    renderResult = renderVisualPlan(candidateJsonPath, htmlPath);
  }

  return {
    success: true,
    step: matchedStep,
    steps,
    candidate: updatedCandidate,
    renderResult,
    stepsJsonPath,
    candidateJsonPath,
    htmlPath
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
