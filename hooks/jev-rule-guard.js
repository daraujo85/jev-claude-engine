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
import { renderDiffCard, renderJevCard } from '../src/ui.js';

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
      },
      breaks_public_contract: {
        type: QUESTION_TYPES.NOUL,
        instructions: 'Esta alteração quebra, renomeia ou remove assinaturas de funções públicas/exportadas existentes que outros módulos já utilizam?'
      },
      weakens_existing_behavior: {
        type: QUESTION_TYPES.NOUL,
        instructions: 'O código deleta, desativa ou enfraquece lógica funcional pré-existente ou testes existentes ao invés de estendê-los com compatibilidade?'
      }
    },
    {
      feature: 'rule-and-regression-guard',
      tokensSpared: 6000,
      llmLatency: 3200,
      projectDir: cwd
    }
  );

  const answers = result?.answers || {};
  const ruleViolation = answers.violates_rule?.noul === true && (answers.violates_rule?.probability || 0) >= 0.80;
  const contractRegression = answers.breaks_public_contract?.noul === true && (answers.breaks_public_contract?.probability || 0) >= 0.85;
  const logicRegression = answers.weakens_existing_behavior?.noul === true && (answers.weakens_existing_behavior?.probability || 0) >= 0.85;

  if (ruleViolation || contractRegression || logicRegression) {
    let reason = 'Violação de regras de arquitetura ou convenções do projeto';
    let prob = answers.violates_rule?.probability || 0.85;

    if (contractRegression) {
      reason = 'REGRESSÃO DETECTADA: Quebra ou remoção de assinatura pública/contrato existente';
      prob = answers.breaks_public_contract?.probability || prob;
    } else if (logicRegression) {
      reason = 'REGRESSÃO DETECTADA: Deleção ou enfraquecimento de lógica funcional pré-existente';
      prob = answers.weakens_existing_behavior?.probability || prob;
    }

    const diffCard = renderDiffCard({
      filePath,
      ruleViolated: reason,
      confidence: prob,
      diffSnippet: fileContent.slice(0, 300)
    });

    process.stderr.write(diffCard);
    process.exit(2); // Claude Code block signal
  }

  process.exit(0);
}

main().catch(() => process.exit(0)); // Fail-open on unhandled exception
