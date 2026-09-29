import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const SKILL_PICKER_HOOK = path.resolve('hooks/jev-skill-picker.js');
const RULE_GUARD_HOOK = path.resolve('hooks/jev-rule-guard.js');

test('T7: jev-skill-picker runs via stdin and exits 0', () => {
  const result = spawnSync('node', [SKILL_PICKER_HOOK], {
    input: JSON.stringify({ prompt: 'Execute o teste automatizado do servico' }),
    env: { ...process.env, JEV_MOCK_MODE: '1' },
    encoding: 'utf-8'
  });

  assert.equal(result.status, 0);
});

test('T9: jev-rule-guard allows safe code edit (exit 0)', () => {
  const safePayload = JSON.stringify({
    tool_name: 'FileEdit',
    tool_input: {
      path: 'src/clean-service.js',
      content: 'export function safeFunction() { return 42; }'
    }
  });

  const result = spawnSync('node', [RULE_GUARD_HOOK], {
    input: safePayload,
    env: { ...process.env, JEV_MOCK_MODE: '1' },
    encoding: 'utf-8'
  });

  assert.equal(result.status, 0);
});

test('T9: jev-rule-guard blocks rule-violating code edit (exit 2)', () => {
  const violatingPayload = JSON.stringify({
    tool_name: 'FileEdit',
    tool_input: {
      path: 'src/controllers/user.controller.js',
      content: 'import forbidden from "database"; // break_rule direct database query in controller bypass'
    }
  });

  const result = spawnSync('node', [RULE_GUARD_HOOK], {
    input: violatingPayload,
    env: { ...process.env, JEV_MOCK_MODE: '1' },
    encoding: 'utf-8'
  });

  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes('JEV GUARD BLOQUEIO AUTOMÁTICO'));
});
