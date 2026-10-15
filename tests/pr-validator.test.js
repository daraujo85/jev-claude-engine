import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parsePrCommand, validatePrCreation } from '../src/pr-validator.js';
import { getProjectPrRules, hasNoCommentsPolicy, saveProjectRule } from '../src/rule-parser.js';
import { createGitFlowProject } from './fixtures/gitflow-project.js';

test('parsePrCommand: parses GitHub CLI (gh pr create)', () => {
  const cmd = 'gh pr create --base release --head develop --title "Promote" --body "Details"';
  const parsed = parsePrCommand(cmd);
  assert.equal(parsed.isPrCreate, true);
  assert.equal(parsed.tool, 'gh');
  assert.equal(parsed.base, 'release');
  assert.equal(parsed.head, 'develop');
  assert.equal(parsed.title, 'Promote');
});

test('parsePrCommand: parses short flags (-B / -H)', () => {
  const cmd = 'gh pr create -B release -H feat/login -t "Login"';
  const parsed = parsePrCommand(cmd);
  assert.equal(parsed.isPrCreate, true);
  assert.equal(parsed.base, 'release');
  assert.equal(parsed.head, 'feat/login');
  assert.equal(parsed.title, 'Login');
});

test('parsePrCommand: parses Azure DevOps CLI (az repos pr create)', () => {
  const cmd = 'az repos pr create --target-branch release --source-branch develop --title "Release PR"';
  const parsed = parsePrCommand(cmd);
  assert.equal(parsed.isPrCreate, true);
  assert.equal(parsed.tool, 'az');
  assert.equal(parsed.base, 'release');
  assert.equal(parsed.head, 'develop');
  assert.equal(parsed.title, 'Release PR');
});

test('parsePrCommand: ignores non-PR commands', () => {
  assert.equal(parsePrCommand('git status').isPrCreate, false);
  assert.equal(parsePrCommand('gh issue list').isPrCreate, false);
  assert.equal(parsePrCommand('git push origin develop').isPrCreate, false);
});

test('validatePrCreation: blocks with PR_RULES_UNDEFINED when project has no rules', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-pr-norules-'));
  const res = await validatePrCreation({
    head: 'develop',
    base: 'main',
    cwd: tmpDir,
    command: 'gh pr create'
  });

  assert.equal(res.allowed, false);
  assert.equal(res.reason, 'PR_RULES_UNDEFINED');
  assert.ok(res.message.includes('perguntar ao usuário'));
  fs.rmSync(tmpDir, { recursive: true });
});

test('validatePrCreation & getProjectPrRules: blocks forbidden develop -> release in a Git Flow project', async () => {
  const projectDir = createGitFlowProject();
  const prRules = getProjectPrRules(projectDir);
  assert.equal(prRules.hasPrRules, true);
  assert.ok(prRules.forbiddenCombinations.some(f => f.head === 'develop' && f.base === 'release'));

  // Test develop -> release blocked
  const resForbidden = await validatePrCreation({
    head: 'develop',
    base: 'release',
    cwd: projectDir,
    command: 'gh pr create --base release --head develop'
  });
  assert.equal(resForbidden.allowed, false);
  assert.equal(resForbidden.reason, 'FORBIDDEN_BRANCH_FLOW');
  assert.ok(resForbidden.message.includes('cherry-pick'));

  // Test feature branch -> release allowed
  const resAllowed = await validatePrCreation({
    head: 'feature/issue-2483-cherry',
    base: 'release',
    cwd: projectDir,
    command: 'gh pr create --base release --head feature/issue-2483-cherry'
  });
  assert.equal(resAllowed.allowed, true);
});

test('hasNoCommentsPolicy: detects strict comment ban in project and subfolders', () => {
  const projectDir = createGitFlowProject();
  assert.equal(hasNoCommentsPolicy(projectDir), true);
  assert.equal(hasNoCommentsPolicy(path.join(projectDir, 'frontend')), true);
  assert.equal(hasNoCommentsPolicy(path.join(projectDir, 'backend')), true);
});

test('saveProjectRule: writes rule to .claude/jev-rules.md and reflects in getProjectPrRules', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-save-rule-'));
  fs.mkdirSync(path.join(tmpDir, '.git')); // mock git repo

  saveProjectRule(tmpDir, 'Nunca abrir PR de develop para release direto. Sempre passar por staging.');
  const rules = getProjectPrRules(tmpDir);
  assert.equal(rules.hasPrRules, true);
  assert.ok(rules.forbiddenCombinations.some(f => f.head === 'develop' && f.base === 'release'));

  fs.rmSync(tmpDir, { recursive: true });
});
