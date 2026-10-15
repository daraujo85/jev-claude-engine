/**
 * JEV Fan-out — decompose a task into parallel sub-tasks, route each to the
 * best model/combo (via model-router), and validate the aggregated result.
 *
 * Uses System One primitives only: choice (which sub-tasks, which combo),
 * score (independence/complexity), noul (completeness check on the result).
 */
import { JevClient } from './client.js';
import { QUESTION_TYPES } from './types.js';
import { routeTask, listModels, routerFeatures } from './model-router.js';

/**
 * Decompose a task into independent sub-tasks. Returns
 * { subTasks: [{id, title, kind}], fanout: bool, latency_ms }.
 */
export async function decomposeTask(task, options = {}) {
  const client = new JevClient();
  const subTaskKinds = options.kinds || [
    'write_code',
    'refactor',
    'test',
    'review',
    'docs',
    'research',
    'debug'
  ];
  const result = await client.evaluate(
    `TAREFA: ${task}\nDecomponha em sub-tarefas paralelas independentes (fan-out).`,
    {
      should_fanout: {
        type: QUESTION_TYPES.NOUL,
        instructions: 'Esta tarefa é grande o bastante para ser decomposta em sub-tarefas paralelas independentes, ou é melhor executar como uma unidade?'
      },
      sub_task_1: {
        type: QUESTION_TYPES.CHOICE,
        instructions: 'Qual o 1º tipo de sub-tarefa que avança a tarefa e pode rodar em paralelo?',
        criteria: subTaskKinds.reduce((a, k) => { a[k] = k.replace(/_/g, ' '); return a; }, { none: 'sem sub-tarefa' })
      },
      sub_task_2: {
        type: QUESTION_TYPES.CHOICE,
        instructions: 'Qual o 2º tipo de sub-tarefa paralela (se houver)?',
        criteria: subTaskKinds.reduce((a, k) => { a[k] = k.replace(/_/g, ' '); return a; }, { none: 'sem sub-tarefa' })
      },
      sub_task_3: {
        type: QUESTION_TYPES.CHOICE,
        instructions: 'Qual o 3º tipo de sub-tarefa paralela (se houver)?',
        criteria: subTaskKinds.reduce((a, k) => { a[k] = k.replace(/_/g, ' '); return a; }, { none: 'sem sub-tarefa' })
      }
    },
    { feature: 'task-fanout' }
  );

  const answers = result?.answers || {};
  const shouldFanout = answers.should_fanout?.noul === true;
  const kinds = ['sub_task_1', 'sub_task_2', 'sub_task_3']
    .map(k => answers[k]?.choice)
    .filter(k => k && k !== 'none');

  return {
    fanout: shouldFanout && kinds.length > 1,
    subTasks: kinds.map((kind, i) => ({ id: 'st' + (i + 1), title: kind, kind })),
    latency_ms: result.latency_ms || 0
  };
}

/**
 * Route each sub-task to the best combo/model via model-router. Returns
 * [{ subTask, combo }] — the fan-out plan with per-sub-task model choice.
 */
export async function routeSubTasks(subTasks, options = {}) {
  const { combos } = await listModels();
  const comboList = combos.map(m => ({ name: m.id, task: 'general', models: [m.id], primary: m.id, failover: [] }));
  const plan = [];
  for (const st of subTasks) {
    const r = await routeTask(`${st.kind}: ${st.title}`, comboList);
    plan.push({ subTask: st, combo: r.combo ? r.combo.name : null, confidence: r.confidence });
  }
  return plan;
}

/**
 * Validate the aggregated result of a fan-out with JEV: did it fully cover
 * the original task? Returns { complete, confidence, reason }.
 */
export async function validateFanout(task, subTasks, options = {}) {
  const client = new JevClient();
  const result = await client.evaluate(
    `TAREFA ORIGINAL: ${task}\nSUB-TAREFAS EXECUTADAS: ${subTasks.map(s => `- ${s.id}: ${s.title} (${s.kind})`).join('\n')}`,
    {
      complete: {
        type: QUESTION_TYPES.NOUL,
        instructions: 'O conjunto de sub-tarefas paralelas cobre completamente a tarefa original, sem lacunas?'
      }
    },
    { feature: 'fanout-validate' }
  );
  const ans = result?.answers?.complete;
  return {
    complete: ans?.noul === true,
    confidence: ans?.probability || 0,
    reason: ans?.noul === true ? 'cobertura completa' : 'há lacunas a revisar',
    latency_ms: result.latency_ms || 0
  };
}