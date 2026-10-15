import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createGitFlowProject } from './fixtures/gitflow-project.js';

const SKILL_PICKER_HOOK = path.resolve('hooks/jev-skill-picker.js');
const RULE_GUARD_HOOK = path.resolve('hooks/jev-rule-guard.js');
const PR_GUARD_HOOK = path.resolve('hooks/jev-pr-guard.js');

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
      content: 'import forbidden from "database"; break_rule direct database query in controller bypass'
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

test('T18: jev-pr-guard ignores non-PR bash commands (exit 0)', () => {
  const result = spawnSync('node', [PR_GUARD_HOOK], {
    input: JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'git status' }
    }),
    encoding: 'utf-8'
  });
  assert.equal(result.status, 0);
});

test('T18: jev-pr-guard blocks develop -> release in a Git Flow project (exit 2)', () => {
  const projectDir = createGitFlowProject();
  const result = spawnSync('node', [PR_GUARD_HOOK], {
    input: JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'gh pr create --base release --head develop --title "deploy"' },
      cwd: projectDir
    }),
    encoding: 'utf-8'
  });

  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes('JEV PR GUARD BLOQUEADO'));
  assert.ok(result.stderr.includes('FORBIDDEN_BRANCH_FLOW'));
});

test('T18: jev-pr-guard allows authorized feature -> release in a Git Flow project (exit 0)', () => {
  const projectDir = createGitFlowProject();
  const result = spawnSync('node', [PR_GUARD_HOOK], {
    input: JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'gh pr create --base release --head feature/issue-2483-promote --title "deploy"' },
      cwd: projectDir
    }),
    encoding: 'utf-8'
  });

  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('verificado e autorizado'));
});

test('T18: jev-pr-guard blocks and asks user when PR rules are undefined (exit 2)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-pr-undefined-'));
  const result = spawnSync('node', [PR_GUARD_HOOK], {
    input: JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'gh pr create --base main --head new-branch' },
      cwd: tmpDir
    }),
    encoding: 'utf-8'
  });

  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes('PR_RULES_UNDEFINED'));
  assert.ok(result.stderr.includes('perguntar ao usuário'));
  fs.rmSync(tmpDir, { recursive: true });
});

test('T19: jev-rule-guard blocks code edits with comments in no-comments projects (exit 2)', () => {
  const projectDir = createGitFlowProject();
  const result = spawnSync('node', [RULE_GUARD_HOOK], {
    input: JSON.stringify({
      tool_name: 'FileEdit',
      tool_input: {
        path: 'frontend/src/views/test.vue',
        content: '<template><div>Hello</div></template>\n<script setup>\n// Forbidden comment\nconst count = 0;\n</script>'
      },
      cwd: projectDir
    }),
    encoding: 'utf-8'
  });

  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes('CÓDIGO SEM COMENTÁRIOS'));
});

test('T19: jev-rule-guard blocks edits on files that have existing comments (exit 2)', () => {
  const projectDir = createGitFlowProject();
  const tmpDir = fs.mkdtempSync(path.join(projectDir, 'frontend/src/tmp-test-'));
  const targetFile = path.join(tmpDir, 'Uncleaned.vue');
  fs.writeFileSync(targetFile, '<template><div>Test</div></template>\n<script>\n// Old leftover comment\nexport default {};\n</script>', 'utf-8');

  const result = spawnSync('node', [RULE_GUARD_HOOK], {
    input: JSON.stringify({
      tool_name: 'replace_file_content',
      tool_input: {
        path: targetFile,
        targetContent: 'export default {};',
        replacementContent: 'export default { data() { return {}; } };'
      },
      cwd: projectDir
    }),
    encoding: 'utf-8'
  });

  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes('LIMPEZA DE COMENTÁRIOS OBRIGATÓRIA'));

  fs.rmSync(tmpDir, { recursive: true });
});
