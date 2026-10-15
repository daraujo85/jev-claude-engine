/**
 * JEV Task Router — classify a free-text task, map it to a 9Router combo
 * and a JEV subagent, so Claude Code can delegate to the right subagent
 * with the right model. Uses System One (choice/score) — no generative LLM.
 *
 * Decision flow:
 *   1. System One classifies the user prompt into one JEV task type.
 *   2. Look up the combo for that task in config (router.task_combos).
 *   3. Return { task, combo, subagent, confidence } for the caller (hook).
 */
import { JevClient } from './client.js';
import { QUESTION_TYPES } from './types.js';
import { loadConfig, isEnabled } from './jev-config.js';

export const TASK_TYPES = [
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

// subagent name is derived from the task (dashes, jev- prefix).
export function taskToSubagent(task) {
  return 'jev-' + task.replace(/_/g, '-');
}

export function comboForTask(task, cfg = loadConfig()) {
  const map = cfg?.router?.task_combos || {};
  return map[task] || '';
}

export async function classifyTask(prompt, options = {}) {
  const client = new JevClient();
  const criteria = { none: 'Prompt geral sem tarefa especializada' };
  for (const t of TASK_TYPES) {
    criteria[t] = t.replace(/_/g, ' ');
  }
  const result = await client.evaluate(
    `TAREFA: ${prompt}`,
    { task: {
      type: QUESTION_TYPES.CHOICE,
      instructions: 'Classifique a tarefa do usuário no tipo mais adequado (custo-benefício).',
      criteria
    } },
    { feature: 'task-router', ...options }
  );
  const ans = result?.answers?.task;
  const task = ans?.choice || 'none';
  const confidence = ans?.confidence || 0;
  const prob = ans?.probabilities?.[task] || confidence;
  return { task, confidence, probability: prob, latency_ms: result.latency_ms || 0 };
}

export async function routeToSubagent(prompt, options = {}) {
  const { task, confidence, probability, latency_ms } = await classifyTask(prompt, options);
  const combo = comboForTask(task);
  const subagent = taskToSubagent(task);
  return { task, combo, subagent, confidence, probability, latency_ms };
}