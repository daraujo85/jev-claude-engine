import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const FAST_COMPACT_HOOK = path.resolve('hooks/jev-fast-compact.js');
const TEST_VERIFIER_HOOK = path.resolve('hooks/jev-test-verifier.js');

test('T10: jev-fast-compact skips when context utilization is <= 25%', () => {
  const result = spawnSync('node', [FAST_COMPACT_HOOK], {
    input: JSON.stringify({ context_utilization: 20 }),
    env: { ...process.env, JEV_MOCK_MODE: '1' },
    encoding: 'utf-8'
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('T10: jev-fast-compact triggers JEV when context utilization is > 25%', () => {
  const result = spawnSync('node', [FAST_COMPACT_HOOK], {
    input: JSON.stringify({
      context_utilization: 65,
      session_id: 'test-1',
      what_triggered_compaction: 'auto'
    }),
    env: { ...process.env, JEV_MOCK_MODE: '1' },
    encoding: 'utf-8'
  });

  assert.equal(result.status, 0);
  // PreCompact contract: JSON object with systemMessage (TUI) +
  // hookSpecificOutput.custom_instructions (compaction guidance).
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.systemMessage.includes('JEV'));
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'PreCompact');
  assert.ok(typeof parsed.hookSpecificOutput.custom_instructions === 'string');
});

test('T11: jev-test-verifier skips non-control files', () => {
  const result = spawnSync('node', [TEST_VERIFIER_HOOK], {
    input: JSON.stringify({
      tool_name: 'FileEdit',
      tool_input: { path: 'src/styles/theme.css' }
    }),
    env: { ...process.env, JEV_MOCK_MODE: '1' },
    encoding: 'utf-8'
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('T11: jev-test-verifier warns on uncovered control files', () => {
  const result = spawnSync('node', [TEST_VERIFIER_HOOK], {
    input: JSON.stringify({
      tool_name: 'FileEdit',
      tool_input: {
        path: 'src/auth/roles-policy.js',
        content: 'export const ADMIN_ROLE = "superadmin";'
      }
    }),
    env: { ...process.env, JEV_MOCK_MODE: '1' },
    encoding: 'utf-8'
  });

  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('JEV TEST VERIFIER'));
});
