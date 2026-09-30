#!/usr/bin/env node
/**
 * JEV Anti-Hallucination Guard for Antigravity (AGY)
 * Listens on PreToolUse for write_to_file and replace_file_content.
 * Returns { decision: "deny", reason: "..." } or { decision: "allow" }
 */

import { JevClient } from '/Users/diegoaraujo/Documents/projects/jev-claude-engine/src/client.js';
import { extractProjectRules } from '/Users/diegoaraujo/Documents/projects/jev-claude-engine/src/rule-parser.js';
import { QUESTION_TYPES } from '/Users/diegoaraujo/Documents/projects/jev-claude-engine/src/types.js';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  if (!input.trim()) {
    console.log(JSON.stringify({ decision: 'allow' }));
    process.exit(0);
  }

  let payload = {};
  try {
    payload = JSON.parse(input);
  } catch {
    console.log(JSON.stringify({ decision: 'allow' }));
    process.exit(0);
  }

  const toolCall = payload.toolCall || {};
  const toolName = toolCall.name || '';
  const args = toolCall.args || {};

  const filePath = args.TargetFile || args.targetFile || args.path || '';
  const content = args.CodeContent || args.ReplacementContent || args.codeContent || args.content || '';

  if (!content || content.length < 20) {
    console.log(JSON.stringify({ decision: 'allow' }));
    process.exit(0);
  }

  const workspace = (payload.workspacePaths && payload.workspacePaths[0]) || process.cwd();
  const rules = extractProjectRules(workspace);

  const context = `
ARQUIVO MODIFICADO: ${filePath}
REGRAS DO PROJETO:
${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

CÓDIGO/DIFF PROPOSTO:
${content.slice(0, 4000)}
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
      feature: 'agy-rule-and-regression-guard',
      tokensSpared: 6000,
      llmLatency: 3200,
      projectDir: workspace
    }
  );

  const answers = result?.answers || {};
  const ruleViolation = answers.violates_rule?.noul === true && (answers.violates_rule?.probability || 0) >= 0.80;
  const contractRegression = answers.breaks_public_contract?.noul === true && (answers.breaks_public_contract?.probability || 0) >= 0.85;
  const logicRegression = answers.weakens_existing_behavior?.noul === true && (answers.weakens_existing_behavior?.probability || 0) >= 0.85;

  if (ruleViolation || contractRegression || logicRegression) {
    let reason = 'Violação de regras de arquitetura do projeto';
    let prob = answers.violates_rule?.probability || 0.85;

    if (contractRegression) {
      reason = 'REGRESSÃO DETECTADA: Quebra ou remoção de assinatura pública/contrato existente';
      prob = answers.breaks_public_contract?.probability || prob;
    } else if (logicRegression) {
      reason = 'REGRESSÃO DETECTADA: Deleção ou enfraquecimento de lógica funcional pré-existente';
      prob = answers.weakens_existing_behavior?.probability || prob;
    }

    const probPct = Math.round(prob * 100);
    console.log(JSON.stringify({
      decision: 'deny',
      reason: `❌ [JEV SENTINEL ANTI-REGRESSÃO]: Operação bloqueada! O JEV detectou ${reason} no arquivo '${filePath}' (${probPct}% certeza). Mantenha a compatibilidade retroativa e preserve a lógica existente.`
    }));
    process.exit(0);
  }

  console.log(JSON.stringify({ decision: 'allow' }));
  process.exit(0);
}

main().catch(() => {
  console.log(JSON.stringify({ decision: 'allow' }));
  process.exit(0);
});
