#!/usr/bin/env node
/**
 * Generate JEV subagents (.claude/agents/jev-*.md) from config
 * router.task_combos. One subagent per task type, model = combo,
 * instructed to read the project profile before writing code.
 */
import { TASK_TYPES } from '../src/task-router.js';
import { loadConfig } from '../src/jev-config.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDirs = [
  join(__dirname, '..', '.claude', 'agents'),
  join(process.env.HOME || '/Users/diegoaraujo', '.claude', 'agents')
];

const TOOL_ALLOWLIST = {
  writing_code: 'Read, Write, Edit, Bash, Glob, Grep',
  refactoring: 'Read, Write, Edit, Bash, Glob, Grep',
  debugging: 'Read, Bash, Glob, Grep, WebFetch',
  tests: 'Read, Write, Edit, Bash, Glob, Grep',
  planning_architecture: 'Read, Bash, Glob, Grep, WebFetch',
  docs: 'Read, Write, Edit, Glob, Grep, WebFetch',
  code_review: 'Read, Bash, Glob, Grep',
  data_analysis: 'Read, Bash, Glob, Grep, WebFetch',
  creative_writing: 'Read, Write, Edit, Glob, Grep',
  transcription: 'Read, Bash, Glob, Grep, WebFetch'
};

const TASK_PROMPTS = {
  writing_code: 'You are the JEV coding subagent. Implement features and write code. Before writing, read the project profile (.claude/jev-profile.md if present) and follow its architecture, layers, code style and test conventions exactly. Match existing patterns — no new folder structures, no style drift.',
  refactoring: 'You are the JEV refactoring subagent. Improve existing code while preserving behavior. First read .claude/jev-profile.md (if present) to understand the architecture and conventions. Refactor within the existing structure — do not introduce new patterns or reorganize the project.',
  debugging: 'You are the JEV debugging subagent. Diagnose and fix bugs. Read .claude/jev-profile.md (if present) for stack/architecture context before investigating. Keep fixes minimal and consistent with the surrounding code.',
  tests: 'You are the JEV testing subagent. Write and fix tests. Read .claude/jev-profile.md (if present) to learn the test framework, naming, and file layout the project uses, then follow it. Do not introduce a different test style.',
  planning_architecture: 'You are the JEV architecture subagent. Design and plan. Read .claude/jev-profile.md (if present) first to understand the existing architecture, then propose changes that extend it coherently. Never propose a wholesale rewrite that ignores current structure.',
  docs: 'You are the JEV docs subagent. Write documentation. Match the style, structure and tooling described in .claude/jev-profile.md (if present). Keep terminology consistent with the codebase.',
  code_review: 'You are the JEV review subagent. Review code against the project standards in .claude/jev-profile.md (if present): architecture fit, code style, tests, and consistency with existing patterns.',
  data_analysis: 'You are the JEV data subagent. Analyze data and report. Follow any conventions in .claude/jev-profile.md (if present). Present numbers clearly.',
  creative_writing: 'You are the JEV writing subagent. Produce creative text. Match the tone and structure conventions in .claude/jev-profile.md (if present) where relevant.',
  transcription: 'You are the JEV transcription subagent. Transcribe and summarize audio/video. Follow the output conventions in .claude/jev-profile.md (if present).'
};

function main() {
  const cfg = loadConfig();
  const map = cfg?.router?.task_combos || {};
  for (const outDir of outDirs) {
    mkdirSync(outDir, { recursive: true });
  }
  let n = 0;
  for (const task of TASK_TYPES) {
    const combo = map[task];
    if (!combo) continue;
    const name = 'jev-' + task.replace(/_/g, '-');
    const desc = taskToDesc(task, combo);
    const md = `---
name: ${name}
description: ${desc}
tools: ${TOOL_ALLOWLIST[task] || 'Read, Write, Edit, Bash, Glob, Grep'}
model: ${combo}
---

${TASK_PROMPTS[task] || 'You are the JEV subagent. Read .claude/jev-profile.md (if present) and follow the project conventions.'}
`;
    for (const outDir of outDirs) {
      writeFileSync(join(outDir, name + '.md'), md);
    }
    n++;
  }
  console.log(`Generated ${n} subagents in: ${outDirs.join(', ')}`);
}

function taskToDesc(task, combo) {
  const d = {
    writing_code: 'Writes and implements code. Use proactively when the task is to implement or create something in code.',
    refactoring: 'Refactors existing code preserving behavior. Use proactively for refactoring or cleanup tasks.',
    debugging: 'Debugs and fixes errors. Use proactively for bug investigation and fixing.',
    tests: 'Writes and fixes automated tests. Use proactively for test-related tasks.',
    planning_architecture: 'Plans architecture and designs solutions. Use proactively for planning or design work.',
    docs: 'Writes documentation. Use proactively for docs or explanation writing.',
    code_review: 'Reviews code for quality and consistency. Use proactively for reviews.',
    data_analysis: 'Analyzes data and reports findings. Use proactively for data tasks.',
    creative_writing: 'Produces creative text. Use proactively for copy, content or creative writing.',
    transcription: 'Transcribes and summarizes audio/video. Use proactively for transcription.'
  };
  return (d[task] || 'JEV subagent for ' + task) + ` Runs on combo ${combo}.`;
}

main();