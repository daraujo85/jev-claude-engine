#!/usr/bin/env node
/**
 * JEV Fan-out CLI — decompose, route sub-tasks, validate.
 *
 *   jev-fanout "tarefa"                 # decompose + route plan
 *   jev-fanout "tarefa" --json          # machine-readable
 *   jev-fanout "tarefa" --validate "resultado..."  # validate coverage
 */
import { decomposeTask, routeSubTasks, validateFanout } from '../../src/fanout.js';

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const task = args.find(a => !a.startsWith('--'));
  if (!task) {
    console.log('uso: jev-fanout "tarefa" [--json] [--validate "resultado..."]');
    process.exit(1);
  }

  const validateIdx = args.indexOf('--validate');
  if (validateIdx >= 0) {
    const result = args[validateIdx + 1];
    const dec = await decomposeTask(task);
    const v = await validateFanout(task, dec.subTasks);
    console.log(`COBERTURA: ${v.complete ? 'completa' : 'lacunas'} (${Math.round(v.confidence * 100)}%, ${v.latency_ms}ms)`);
    return;
  }

  const dec = await decomposeTask(task);
  if (!dec.fanout || dec.subTasks.length === 0) {
    console.log(`FAN-OUT: executar como unidade única (${dec.latency_ms}ms).`);
    return;
  }

  const plan = await routeSubTasks(dec.subTasks);

  if (asJson) {
    console.log(JSON.stringify({ task, fanout: true, subTasks: dec.subTasks, plan }, null, 2));
    return;
  }

  console.log(`FAN-OUT: tarefa decomposta em ${dec.subTasks.length} sub-tarefas paralelas (${dec.latency_ms}ms).\n`);
  plan.forEach(p => {
    console.log(`  ${p.subTask.id} · ${p.subTask.kind.replace(/_/g, ' ')}`);
    console.log(`     → combo/modelo: ${p.combo || 'auto'} (${Math.round(p.confidence * 100)}%)`);
  });
  console.log('\nExecute cada sub-tarefa em um subagente paralelo e valide com:');
  console.log(`  jev-fanout "${task}" --validate "<resultado agregado>"`);
}

main().catch(err => { console.error('erro:', err.message); process.exit(1); });