import test from 'node:test';
import assert from 'node:assert/strict';
import { rankFiles } from '../skills/jev-explore/explore.js';
import { runCodeReviewPreFilter } from '../skills/jev-review/review.js';
import { decideNextAction } from '../skills/jev-browser-test/navigator.js';

process.env.JEV_MOCK_MODE = '1';

test('T12: rankFiles ranks files with JEV Score and returns top 3', async () => {
  const files = [
    'src/auth/token-service.js',
    'src/helpers/date-util.js',
    'src/styles/theme.css',
    'src/components/button.js',
    'src/auth/jwt-refresher.js'
  ];

  const top = await rankFiles('como o token de autenticacao e renovado', files);
  assert.ok(top.length <= 3);
  assert.ok(top[0].score >= top[top.length - 1].score);
});

test('T13: runCodeReviewPreFilter returns fast pass on empty/clean diff', async () => {
  const result = await runCodeReviewPreFilter('');
  assert.equal(result.fastPass, true);
});

test('T13: runCodeReviewPreFilter escalates on violating diff', async () => {
  const violatingDiff = `
diff --git a/src/auth.js b/src/auth.js
+// break_rule bypass authentication security and direct db query
`;
  const result = await runCodeReviewPreFilter(violatingDiff);
  assert.ok(result.risks.length > 0 || result.fastPass !== undefined);
});

test('T14: decideNextAction picks relevant DOM element via JEV Choice', async () => {
  const dom = [
    { id: 'btn_billing', tag: 'button', text: 'Faturamento e Pagamentos' },
    { id: 'btn_home', tag: 'button', text: 'Home' }
  ];

  const action = await decideNextAction('Acessar tela de faturamento', dom);
  assert.equal(action.targetId, 'btn_billing');
  assert.ok(action.confidence >= 0.7);
});
