#!/usr/bin/env node
/**
 * JEV Test Coverage Verifier for Antigravity (AGY)
 * Listens on PostToolUse for write_to_file and replace_file_content.
 * Injects additionalContext into AGY conversation if control file lacks tests.
 */

import path from 'node:path';
import { JevClient } from '/Users/diegoaraujo/Documents/projects/jev-claude-engine/src/client.js';
import { findExistingTests } from '/Users/diegoaraujo/Documents/projects/jev-claude-engine/hooks/jev-test-verifier.js';
import { QUESTION_TYPES } from '/Users/diegoaraujo/Documents/projects/jev-claude-engine/src/types.js';

const CONTROL_FILE_REGEX = /(auth|role|permission|policy|guard|rule|access|payment|billing|session)/i;

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  if (!input.trim()) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  let payload = {};
  try {
    payload = JSON.parse(input);
  } catch {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  const toolCall = payload.toolCall || {};
  const args = toolCall.args || {};
  const filePath = args.TargetFile || args.targetFile || args.path || '';

  if (!CONTROL_FILE_REGEX.test(filePath)) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  const workspace = (payload.workspacePaths && payload.workspacePaths[0]) || process.cwd();
  const testFiles = findExistingTests(workspace);

  const context = `
ARQUIVO DE CONTROLE MODIFICADO: ${filePath}
SUÍTES DE TESTE EXISTENTES NO PROJETO:
${testFiles.length > 0 ? testFiles.map(t => `- ${t}`).join('\n') : 'NENHUM ARQUIVO DE TESTE ENCONTRADO'}
CONTEÚDO:
${JSON.stringify(args).slice(0, 2500)}
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
      feature: 'agy-test-coverage',
      tokensSpared: 6000,
      llmLatency: 3000,
      projectDir: workspace
    }
  );

  const answer = result?.answers?.has_test_coverage;
  if (answer && answer.noul === false) {
    console.log(JSON.stringify({
      additionalContext: `⚠️ [JEV TEST VERIFIER]: O arquivo de controle '${path.basename(filePath)}' foi modificado, mas o JEV detectou ausência de testes automatizados para estas regras (${Math.round((1 - (answer.probability || 0.2)) * 100)}% certeza). Recomenda-se criar ou atualizar testes correspondentes.`
    }));
    process.exit(0);
  }

  console.log(JSON.stringify({}));
  process.exit(0);
}

main().catch(() => {
  console.log(JSON.stringify({}));
  process.exit(0);
});
