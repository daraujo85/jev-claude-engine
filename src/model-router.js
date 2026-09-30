/**
 * JEV Model Router — classify 9Router models, suggest combos, route tasks.
 *
 * Reads /v1/models from the 9Router gateway, profiles the real models with
 * JEV System One, suggests optimized combos (with failover order), and
 * routes a task to the best combo. All decisions are System One choice/score
 * primitives — no generative LLM spent on routing.
 */
import { JevClient } from './client.js';
import { QUESTION_TYPES } from './types.js';
import { loadConfig } from './jev-config.js';
import { describeModel, modelMeta } from './model-catalog.js';

function routerConfig() {
  const cfg = loadConfig();
  const r = cfg?.router || {};
  return {
    baseUrl: r.base_url || process.env.NINEROUTER_URL || 'http://localhost:20128',
    apiKey: r.api_key || process.env.ANTHROPIC_AUTH_TOKEN || process.env.NINEROUTER_TOKEN || ''
  };
}

export function gatewayUrl() { return routerConfig().baseUrl; }
export function gatewayToken() { return routerConfig().apiKey; }

export function routerFeatures() {
  const cfg = loadConfig();
  const r = cfg?.router || {};
  return {
    modelProfiler: r.model_profiler !== false,
    comboSuggester: r.combo_suggester !== false,
    taskRouter: r.task_router !== false
  };
}

export async function listModels() {
  const { baseUrl, apiKey } = routerConfig();
  const res = await fetch(`${baseUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) throw new Error(`9router /v1/models: HTTP ${res.status}`);
  const data = await res.json();
  const items = data?.data || [];
  return {
    real: items.filter(m => String(m.id).includes('/')),
    combos: items.filter(m => !String(m.id).includes('/')),
    all: items
  };
}

function modelLabel(m) {
  const id = String(m.id);
  const short = id.includes('/') ? id.split('/')[1] : id;
  const caps = [];
  if (m.capabilities?.vision) caps.push('vision');
  if (m.capabilities?.audioInput) caps.push('audio');
  if (m.capabilities?.imageOutput) caps.push('image-out');
  if (m.capabilities?.tools) caps.push('tools');
  if (m.capabilities?.reasoning) caps.push('reasoning');
  const ctx = m.capabilities?.contextWindow ? Math.round(m.capabilities.contextWindow / 1000) + 'k' : '';
  const meta = modelMeta(id);
  const costBm = meta ? ` · ${describeModel(id)}` : '';
  return `${short} [${caps.join(',') || 'text'}${ctx ? ' ' + ctx : ''}]${costBm}`;
}

/**
 * Profile the given models with JEV: for each model, score how good it is
 * for each task type and pick its best fit. Returns an array of
 * { model, bestTask, score, verdict }.
 */
export async function profileModels(models, options = {}) {
  const client = new JevClient();
  const TASKS = options.tasks || [
    'writing_code',
    'refactoring',
    'planning_architecture',
    'debugging',
    'tests',
    'docs',
    'code_review',
    'data_analysis',
    'creative_writing',
    'transcription'
  ];
  const state = 'Catálogo de modelos com capacidades, custo (USD/M), latência e benchmarks:\n' + models.slice(0, options.maxModels || 60).map(modelLabel).join('\n');

  const questions = {};
  models.slice(0, options.maxModels || 60).forEach((m, i) => {
    questions[`m${i}`] = {
      type: QUESTION_TYPES.CHOICE,
      instructions: `Melhor uso (custo-benefício) do modelo ${i}: ${modelLabel(m)}. Escolha a tarefa onde ele entrega o MAIOR resultado pelo MENOR custo — não só o mais capaz.`,
      criteria: TASKS.reduce((acc, t) => {
        acc[t] = t.replace(/_/g, ' ');
        return acc;
      }, {})
    };
    questions[`s${i}`] = {
      type: QUESTION_TYPES.SCORE,
      instructions: `Nota (1-10) de CUSTO-BENEFÍCIO do modelo ${i} para a tarefa escolhida: pondere capacidade/benchmarks (peso alto), latência e custo por token.`,
      criteria: ['1-2 péssimo custo-benefício', '3-4 ruim', '5-6 mediano', '7-8 bom', '9-10 excelente']
    };
  });

  const result = await client.evaluate(state, questions, { feature: 'model-profiler' });

  return models.slice(0, options.maxModels || 60).map((m, i) => {
    const ans = result?.answers?.[`m${i}`];
    const scoreAns = result?.answers?.[`s${i}`];
    const bestTask = ans?.choice || 'writing_code';
    // JEV score com 5 níveis vem normalizado 0-4 (índice ponderado) → 0-10.
    const rawScore = typeof scoreAns?.score === 'number' ? scoreAns.score : 0;
    const score = Math.min(10, rawScore * 2.5);
    return {
      model: String(m.id),
      label: modelLabel(m),
      bestTask,
      score,
      confidence: ans?.confidence || 0
    };
  });
}

/**
 * Suggest combos: group profiled models by task, order by score (best first),
 * and emit a combo object with a failover chain (next models when limits hit).
 */
export function suggestCombos(profiles, options = {}) {
  const byTask = {};
  for (const p of profiles) {
    (byTask[p.bestTask] = byTask[p.bestTask] || []).push(p);
  }
  const combos = [];
  for (const [task, ps] of Object.entries(byTask)) {
    ps.sort((a, b) => b.score - a.score);
    const name = options.comboPrefix || 'jev-' + task;
    const models = ps.slice(0, options.modelsPerCombo || 3).map(p => p.model);
    combos.push({ name, task, models, failover: models.slice(1), primary: models[0] });
  }
  return combos;
}

/**
 * Route a task to the best combo (or model). Returns the chosen combo and
 * its failover chain so the caller can fall back when limits are hit.
 */
export async function routeTask(task, combos, options = {}) {
  const client = new JevClient();
  const criteria = { none: 'Nenhum combo atende' };
  for (const c of combos) {
    criteria[c.name] = `${c.task.replace(/_/g, ' ')} — ${c.models.join(', ')}`;
  }
  const result = await client.evaluate(
    `TAREFA: ${task}`,
    { combo: {
      type: QUESTION_TYPES.CHOICE,
      instructions: 'Qual combo/modelo é o mais adequado para esta tarefa?',
      criteria
    } },
    { feature: 'task-router' }
  );
  const choice = result?.answers?.combo?.choice;
  const combo = combos.find(c => c.name === choice) || null;
  return { combo, confidence: result?.answers?.combo?.confidence || 0, latency_ms: result.latency_ms || 0 };
}