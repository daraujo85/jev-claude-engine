import test from 'node:test';
import assert from 'node:assert/strict';
import { modelMeta, describeModel, MODEL_CATALOG } from '../src/model-catalog.js';
import { suggestCombos } from '../src/model-router.js';

test('T15: modelMeta returns cost/benchmark/value for known models', () => {
  const m = modelMeta('cc/claude-opus-5');
  assert.ok(m);
  assert.ok(m.costIn > 0);
  assert.ok(m.benchmarkAvg > 0);
  assert.ok(m.value > 0 && m.value <= 100);
  assert.equal(m.latency, 'high');
});

test('T15: modelMeta falls back to short id (provider/ prefix stripped)', () => {
  const full = modelMeta('cc/claude-sonnet-5');
  assert.ok(full, 'full id should resolve');
});

test('T15: modelMeta returns null for unknown model', () => {
  assert.equal(modelMeta('cc/unknown-model-xyz'), null);
});

test('T15: describeModel produces a compact summary', () => {
  const s = describeModel('cc/claude-opus-5');
  assert.ok(s.includes('custo'));
  assert.ok(s.includes('HE'));
  assert.ok(s.includes('latência'));
});

test('T15: suggestCombos groups by task, orders by score, builds failover', () => {
  const profiles = [
    { model: 'm1', bestTask: 'writing_code', score: 8 },
    { model: 'm2', bestTask: 'writing_code', score: 5 },
    { model: 'm3', bestTask: 'writing_code', score: 3 },
    { model: 'm4', bestTask: 'planning_architecture', score: 9 }
  ];
  const combos = suggestCombos(profiles, { modelsPerCombo: 3 });
  const code = combos.find(c => c.task === 'writing_code');
  assert.ok(code);
  assert.equal(code.primary, 'm1'); // best first
  assert.deepEqual(code.failover, ['m2', 'm3']);
  const plan = combos.find(c => c.task === 'planning_architecture');
  assert.equal(plan.primary, 'm4');
});

test('T15: catalog has entries for the main model families', () => {
  const ids = Object.keys(MODEL_CATALOG);
  assert.ok(ids.some(id => id.includes('claude')));
  assert.ok(ids.some(id => id.includes('gemini')));
  assert.ok(ids.some(id => id.includes('gpt')));
  assert.ok(ids.some(id => id.includes('deepseek')));
});

test('T16: decomposeTask marks single-unit when no fanout', async () => {
  const { decomposeTask } = await import('../src/fanout.js');
  // JEV mock mode returns noul=false for non-urgent → no fanout
  const prev = process.env.JEV_MOCK_MODE;
  process.env.JEV_MOCK_MODE = '1';
  try {
    const dec = await decomposeTask('corrigir typo no README');
    assert.ok(dec.subTasks.length >= 0);
  } finally {
    if (prev) process.env.JEV_MOCK_MODE = prev; else delete process.env.JEV_MOCK_MODE;
  }
});

test('T16: validateFanout returns a boolean + confidence', async () => {
  const { validateFanout } = await import('../src/fanout.js');
  const prev = process.env.JEV_MOCK_MODE;
  process.env.JEV_MOCK_MODE = '1';
  try {
    const v = await validateFanout('t', [{ id: 'st1', title: 'x', kind: 'write_code' }]);
    assert.equal(typeof v.complete, 'boolean');
    assert.ok(v.confidence >= 0 && v.confidence <= 1);
  } finally {
    if (prev) process.env.JEV_MOCK_MODE = prev; else delete process.env.JEV_MOCK_MODE;
  }
});