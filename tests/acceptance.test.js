import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  extractObligations,
  extractRules,
  detectGaps,
  buildScenarios,
  getDeliveryDiff,
  renderReport,
  saveReport
} from '../skills/business-acceptance-review/acceptance.js';

test('extractObligations: extrai obrigações de um ticket', () => {
  const context = 'Ticket B2B-456: Usuário deve poder cancelar o plano direto no app. O cancelamento não pode cobrar multa. Deve enviar e-mail de confirmação.';
  const rules = extractObligations(context);
  assert.ok(rules.length >= 3, `esperava >= 3, veio ${rules.length}`);
  assert.ok(rules.some(r => r.rule.includes('cancelar o plano')));
  assert.ok(rules.some(r => r.rule.includes('não pode cobrar multa')));
});

test('extractObligations: marca hipóteses como ambiguous', () => {
  const rules = extractObligations('O sistema deve notificar o usuário, talvez por e-mail ou SMS. O usuário deve poder cancelar o plano no app.');
  const hyp = rules.find(r => r.rule.includes('talvez'));
  assert.ok(hyp && hyp.type === 'hypothesis');
  assert.ok(rules.some(r => r.type === 'explicit'));
});

test('extractRules: alias de compatibilidade continua funcionando', () => {
  const rules = extractRules('O app deve exibir o saldo. O app deve exibir o saldo.');
  assert.equal(rules.length, 1);
});

test('extractObligations: contexto sem requisito não gera obrigações', () => {
  const rules = extractObligations('Valeu pela ajuda. Grande abraço.');
  assert.equal(rules.length, 0);
});

test('detectGaps: aponta lacunas típicas sem inventar regra', () => {
  const gaps = detectGaps('Dois responsáveis acompanham o mesmo aluno por meio de um convite.');
  assert.ok(gaps.some(g => g.includes('expiração')));
  assert.ok(gaps.some(g => g.includes('permissões')));
});

test('buildScenarios: gera cenário principal + alternativa quando há condição', () => {
  const rules = extractObligations('Se o convite expirar, o vínculo é recusado.');
  const scen = buildScenarios(rules);
  assert.ok(scen.some(s => s.type === 'principal'));
  assert.ok(scen.some(s => s.type === 'alternativa/fronteira'));
});

test('renderReport: gera matriz de rastreabilidade e parecer de negócio', () => {
  const rules = [
    { id: 'R1', rule: 'Deve enviar notificação.', source: 'contexto', type: 'explicit' }
  ];
  const scen = [
    { id: 'C1', requirement: 'R1', type: 'principal', given: 'Dado', when: 'Quando', then: 'Então' }
  ];
  const report = renderReport('Tarefa X deve enviar notificação.', rules, 'diff fake', ['src/a.js'], scen, []);
  assert.ok(report.includes('R1'));
  assert.ok(report.includes('Matriz de rastreabilidade'));
  assert.ok(report.includes('Resultado de negócio'));
  assert.ok(report.includes('⬜ por verificar'));
  assert.ok(report.includes('src/a.js'));
});

test('getDeliveryDiff: nunca lança', () => {
  assert.doesNotThrow(() => getDeliveryDiff('', '/tmp/nao-existe'));
});

test('saveReport: grava relatório em ~/.jev/reports e retorna caminho', () => {
  const p = saveReport('# teste\nrelatório de teste');
  assert.ok(p, 'deveria retornar caminho');
  assert.ok(p.includes('.jev/reports'));
  assert.ok(p.endsWith('.md'));
  const content = fs.readFileSync(p, 'utf-8');
  assert.ok(content.includes('relatório de teste'));
});