#!/usr/bin/env node
/**
 * JEV Anti-Hallucination & Rule Guard for Antigravity (AGY)
 * Listens on PreToolUse for write_to_file, replace_file_content, and run_command.
 * Returns { decision: "deny", reason: "..." } or { decision: "allow" }
 */

import fs from 'node:fs';
import path from 'node:path';
import { JevClient } from '/Users/diegoaraujo/Documents/projects/jev-claude-engine/src/client.js';
import { extractProjectRules, hasNoCommentsPolicy } from '/Users/diegoaraujo/Documents/projects/jev-claude-engine/src/rule-parser.js';
import { detectComments } from '/Users/diegoaraujo/Documents/projects/jev-claude-engine/src/comment-cleaner.js';
import { parsePrCommand, validatePrCreation } from '/Users/diegoaraujo/Documents/projects/jev-claude-engine/src/pr-validator.js';
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
  const workspace = (payload.workspacePaths && payload.workspacePaths[0]) || args.Cwd || process.cwd();

  // 1. Intercept PR creation commands if run via run_command
  if (toolName === 'run_command' || args.CommandLine) {
    const cmd = args.CommandLine || '';
    const prParsed = parsePrCommand(cmd, workspace);
    if (prParsed.isPrCreate) {
      const val = await validatePrCreation({
        head: prParsed.head,
        base: prParsed.base,
        cwd: workspace,
        command: cmd
      });

      if (!val.allowed) {
        console.log(JSON.stringify({
          decision: 'deny',
          reason: val.message
        }));
        process.exit(0);
      }
    }
    console.log(JSON.stringify({ decision: 'allow' }));
    process.exit(0);
  }

  const filePath = args.TargetFile || args.targetFile || args.path || '';
  const content = args.CodeContent || args.ReplacementContent || args.codeContent || args.content || '';

  if (!content || content.length < 20) {
    console.log(JSON.stringify({ decision: 'allow' }));
    process.exit(0);
  }

  const targetFullPath = path.isAbsolute(filePath) ? filePath : path.join(workspace, filePath);

  // 2. Strict No-Comments Policy check
  if (hasNoCommentsPolicy(workspace)) {
    const proposedCheck = detectComments(content, targetFullPath);
    if (proposedCheck.hasComments) {
      const loc = proposedCheck.locations[0];
      console.log(JSON.stringify({
        decision: 'deny',
        reason: `❌ [JEV CODE STYLE GUARD]: Este projeto proíbe qualquer tipo de comentário no código ('Código sem comentários'). O código contém ${proposedCheck.count} comentário(s) (ex.: linha ${loc.line}: "${loc.text}"). Remova os comentários antes de aplicar.`
      }));
      process.exit(0);
    }

    if (fs.existsSync(targetFullPath)) {
      try {
        const existing = fs.readFileSync(targetFullPath, 'utf-8');
        const existingCheck = detectComments(existing, targetFullPath);
        if (existingCheck.hasComments) {
          let prospective = '';
          if (args.ReplacementContent && args.TargetContent) {
            prospective = existing.replace(args.TargetContent, args.ReplacementContent);
          } else if (args.CodeContent) {
            prospective = args.CodeContent;
          }

          const prospectiveCheck = prospective ? detectComments(prospective, targetFullPath) : existingCheck;
          if (prospectiveCheck.hasComments) {
            const linesList = prospectiveCheck.locations.map(l => l.line).slice(0, 5).join(', ');
            console.log(JSON.stringify({
              decision: 'deny',
              reason: `❌ [JEV CODE STYLE GUARD]: Este projeto proíbe comentários no código ('Código sem comentários'). O arquivo '${path.basename(filePath)}' possui ${prospectiveCheck.count} comentário(s) nas linhas [${linesList}]. Regra do projeto: ao alterar um arquivo com comentários, eles DEVEM ser completamente limpos (execute 'jev clean-comments ${targetFullPath}').`
            }));
            process.exit(0);
          }
        }
      } catch {
        // Skip unreadable file
      }
    }
  }

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
