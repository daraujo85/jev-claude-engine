import test from 'node:test';
import assert from 'node:assert/strict';
import { scanInstalledSkills, parseSkillMetadata } from '../src/skills-scanner.js';
import { extractProjectRules } from '../src/rule-parser.js';

test('T6: scanInstalledSkills detects skills from directory', () => {
  const skills = scanInstalledSkills();
  assert.ok(Array.isArray(skills));
  // In Diego's system there are dozens of skills in ~/.claude/skills
  assert.ok(skills.length > 0);
  assert.ok(skills[0].id);
});

test('T8: extractProjectRules returns non-empty rules list', () => {
  const rules = extractProjectRules();
  assert.ok(Array.isArray(rules));
  assert.ok(rules.length > 0);
  assert.ok(typeof rules[0] === 'string');
});
