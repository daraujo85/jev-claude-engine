import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRules, getDeliveryDiff, renderReport } from '../skills/jev-product-audit/audit.js';

test('extractRules: extrai regras de negócio de um ticket', () => {
  const context = 'Ticket B2B-456: Usuário deve poder cancelar o plano direto no app. O cancelamento não pode cobrar multa. Deve enviar e-mail de confirmação.';
  const rules = extractRules(context);
  assert.ok(rules.length >= 3, `esperava >= 3 regras, veio ${rules.length}`);
  assert.ok(rules.some(r => r.rule.includes('cancelar o plano')));
  assert.ok(rules.some(r => r.rule.includes('não pode cobrar multa')));
});

test('extractRules: bullets contam como regras', () => {
  const context = '- O sistema deve notificar o usuário por e-mail\n- Bloquear pagamento atrasado';
  const rules = extractRules(context);
  assert.ok(rules.length >= 2);
});

test('extractRules: contexto sem requisito não gera regras', () => {
  const rules = extractRules('Valeu pela ajuda. Grande abraço.');
  assert.equal(rules.length, 0);
});

test('extractRules: ignora duplicatas', () => {
  const context = 'O app deve exibir o saldo. O app deve exibir o saldo.';
  const rules = extractRules(context);
  assert.equal(rules.length, 1);
});

test('renderReport: gera tabela com as regras e seção de resumo', () => {
  const report = renderReport('Tarefa X deve enviar notificação.', [
    { id: 'R1', rule: 'Tarefa X deve enviar notificação.', source: 'contexto' }
  ], 'diff fake', ['src/a.js']);
  assert.ok(report.includes('R1'));
  assert.ok(report.includes('⬜ por verificar'));
  assert.ok(report.includes('Resumo executivo'));
  assert.ok(report.includes('src/a.js'));
});

test('getDeliveryDiff: nunca lança', () => {
  assert.doesNotThrow(() => getDeliveryDiff('', '/tmp/nao-existe'));
});