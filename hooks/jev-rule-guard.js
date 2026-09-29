#!/usr/bin/env node
/**
 * JEV Anti-Hallucination / Rule Enforcement Hook (PreToolUse)
 * Intercepts file writes/edits in Claude Code.
 * If JEV detects a rule violation with confidence >= 80%, exits with code 2
 * to deterministically block the tool and enforce refactoring.
 */

import { JevClient } from '../src/client.js';
import { extractProjectRules } from '../src/rule-parser.js';
import { QUESTION_TYPES } from '../src/types.js';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  if (!input.trim()) {
    process.exit(0);
  }

  let toolInput = {};
  let toolName = '';
  let cwd = process.cwd();

  try {
    const json = JSON.parse(input);
    toolInput = json.tool_input || {};
    toolName = json.tool_name || '';
    cwd = json.cwd || process.cwd();
  } catch {
    // Unparseable payload -> fail-open
    process.exit(0);
  }

  // Extract candidate code/content from tool input
  const fileContent =
    toolInput.content ||
    toolInput.replacementContent ||
    toolInput.new_string ||
    toolInput.text ||
    toolInput.command ||
    '';

  const filePath = toolInput.path || toolInput.file_path || toolInput.TargetFile || '';

  // Only check code edits that contain substantive text
  if (!fileContent || fileContent.length < 20) {
    process.exit(0);
  }

  const rules = extractProjectRules(cwd);
  const context = `
ARQUIVO MODIFICADO: ${filePath}
REGRAS DO PROJETO:
${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

CÓDIGO/DIFF PROPOSTO:
${fileContent.slice(0, 4000)}
`;

  const client = new JevClient();
  const result = await client.evaluate(
    context,
    {
      violates_rule: {
        type: QUESTION_TYPES.NOUL,
        instructions: 'Avalie se o código proposto viola direta ou indiretamente alguma das regras ou diretrizes de arquitetura especificadas no projeto.'
      }
    },
    {
      feature: 'rule-guard',
      tokensSpared: 4000,
      llmLatency: 2800,
      projectDir: cwd
    }
  );

  const answer = result?.answers?.violates_rule;

  // PRD Rule: If confidence / probability >= 0.80 that rules are violated -> BLOCK with exit code 2
  if (answer && answer.noul === true && (answer.probability || 0) >= 0.80) {
    const probPct = Math.round((answer.probability || 0) * 100);
    process.stderr.write(
      `\n❌ [JEV GUARD BLOQUEIO AUTOMÁTICO]: Operação rejeitada! O JEV detectou que a alteração no arquivo '${filePath}' viola regras do projeto (${probPct}% certeza).\nPor favor, revise o código para aderir às convenções do projeto antes de tentar gravar.\n\n`
    );
    process.exit(2); // Claude Code block signal
  }

  process.exit(0);
}

main().catch(() => process.exit(0)); // Fail-open on unhandled exception
