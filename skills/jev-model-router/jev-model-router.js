#!/usr/bin/env node
/**
 * JEV Model Router CLI — classify 9Router models, suggest combos, route tasks.
 *
 *   jev-model-router                    # profile models + suggest combos
 *   jev-model-router --list             # list real models and combos
 *   jev-model-router --task "..."       # route a task to the best combo
 *   jev-model-router --json             # machine-readable output
 */
import { listModels, profileModels, suggestCombos, routeTask } from '../../src/model-router.js';

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');

  if (args.includes('--list')) {
    const { real, combos } = await listModels();
    if (asJson) {
      console.log(JSON.stringify({ real: real.map(m => m.id), combos: combos.map(m => m.id) }, null, 2));
      return;
    }
    console.log(`9Router — ${real.length} modelos reais, ${combos.length} combos.\n`);
    console.log('REAIS:');
    real.forEach(m => console.log('  ' + m.id));
    console.log('\nCOMBOS:');
    combos.forEach(m => console.log('  ' + m.id));
    return;
  }

  const task = args.indexOf('--task') >= 0 ? args[args.indexOf('--task') + 1] : null;

  if (task) {
    // route an existing task against current combos
    const { real, combos } = await listModels();
    const comboList = combos.map(m => ({ name: m.id, task: 'general', models: [m.id], primary: m.id, failover: [] }));
    const r = await routeTask(task, comboList);
    console.log(`TAREFA: ${task}`);
    if (r.combo) {
      console.log(`  → COMBO: ${r.combo.name} (${Math.round(r.confidence * 100)}% certeza, ${r.latency_ms}ms)`);
      console.log(`  → MODELO: ${r.combo.primary}`);
    } else {
      console.log('  → nenhum combo adequado.');
    }
    return;
  }

  // full pipeline: profile real models and suggest combos
  const { real } = await listModels();
  console.log(`Perfilando ${Math.min(real.length, 60)} modelos com JEV System One...\n`);
  const profiles = await profileModels(real);
  const combos = suggestCombos(profiles);

  if (asJson) {
    console.log(JSON.stringify({ profiles, combos }, null, 2));
    return;
  }

  console.log('PERFIS POR MODELO:');
  profiles.slice().sort((a, b) => b.score - a.score).forEach(p => {
    console.log(`  ${p.model.padEnd(40)} ${p.bestTask.padEnd(22)} score=${p.score.toFixed(1)} conf=${Math.round(p.confidence * 100)}%`);
  });

  console.log('\nCOMBOS SUGERIDOS (com failover):');
  combos.forEach(c => {
    console.log(`  ${c.name}`);
    console.log(`    primary:  ${c.primary}`);
    if (c.failover.length) console.log(`    failover: ${c.failover.join(', ')}`);
  });
}

main().catch(err => {
  console.error('erro:', err.message);
  process.exit(1);
});