#!/usr/bin/env node
/**
 * JEV Test Coverage Verifier Hook (PostToolUse)
 * Triggers after file edits on control domain files (auth, roles, permissions, billing).
 * Checks if business rules have corresponding automated tests using JEV.
 */

import fs from 'node:fs';
import path from 'node:path';
import { JevClient } from '../src/client.js';
import { QUESTION_TYPES } from '../src/types.js';
import { loadConfig, isEnabled } from '../src/jev-config.js';

// Regex to identify control/critical files (config-overridable).
const DEFAULT_CONTROL_REGEX = /(auth|role|permission|policy|guard|rule|access|payment|billing|session)/i;

export function controlFileRegex(cfg) {
  const pat = cfg?.hooks?.['jev-test-verifier']?.control_file_pattern;
  if (pat) {
    try { return new RegExp(pat, 'i'); } catch { /* fallback */ }
  }
  return DEFAULT_CONTROL_REGEX;
}

export function findExistingTests(rootDir = process.cwd()) {
  const testFiles = [];
  const candidateDirs = ['tests', 'test', '__tests__', 'src'];

  for (const d of candidateDirs) {
    const fullDir = path.join(rootDir, d);
    if (!fs.existsSync(fullDir)) continue;

    try {
      const files = fs.readdirSync(fullDir, { recursive: true, encoding: 'utf-8' });
      for (const f of files) {
        if (typeof f === 'string' && (f.includes('.test.') || f.includes('.spec.'))) {
          testFiles.push(f);
        }
      }
    } catch {
      // directory read fallback
    }
  }

  return testFiles.slice(0, 20);
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  if (!input.trim()) {
    process.exit(0);
  }

  let toolInput = {};
  let cwd = process.cwd();

  try {
    const json = JSON.parse(input);
    toolInput = json.tool_input || {};
    cwd = json.cwd || process.cwd();
  } catch {
    process.exit(0);
  }

  const cfg = loadConfig();
  if (!isEnabled(cfg, 'hooks', 'jev-test-verifier')) {
    process.exit(0);
  }
  const filePath = toolInput.path || toolInput.file_path || toolInput.TargetFile || '';
  if (!controlFileRegex(cfg).test(filePath)) {
    // Not a control domain file -> exit cleanly
    process.exit(0);
  }

  const testFiles = findExistingTests(cwd);
  const context = `
ARQUIVO DE CONTROLE MODIFICADO: ${filePath}
SUÍTES DE TESTE EXISTENTES NO PROJETO:
${testFiles.length > 0 ? testFiles.map(t => `- ${t}`).join('\n') : 'NENHUM ARQUIVO DE TESTE ENCONTRADO'}
CONTEÚDO / REGRAS:
${JSON.stringify(toolInput).slice(0, 2500)}
`;

  const client = new JevClient();
  const result = await client.evaluate(
    context,
    {
      has_test_coverage: {
        type: QUESTION_TYPES.NOUL,
        instructions: 'Determine se as regras de controle ou permissões editadas neste arquivo possuem testes automatizados correspondentes no projeto.'
      }
    },
    {
      feature: 'test-coverage',
      tokensSpared: 6000,
      llmLatency: 3000,
      projectDir: cwd
    }
  );

  const answer = result?.answers?.has_test_coverage;
  // If not covered, warn via systemMessage (visible in TUI) +
  // additionalContext so Claude can act on it.
  if (answer && answer.noul === false) {
    const confidence = Math.round((1 - (answer.probability || 0.2)) * 100);
    const filename = path.basename(filePath);
    process.stdout.write(JSON.stringify({
      systemMessage: `[JEV] Test Verifier: '${filename}' sem cobertura de testes (${confidence}% certeza, ${result.latency_ms || 120}ms)`,
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `\n⚠️  [JEV TEST VERIFIER]: O arquivo de controle '${filename}' foi modificado, mas o JEV detectou que não há cobertura de testes correspondente (${confidence}% certeza).\nRecomenda-se gerar ou atualizar testes automatizados para validar estas regras.\n`
      }
    }));
  }

  process.exit(0);
}

main().catch(() => process.exit(0)); // Fail-open
