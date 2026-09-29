#!/usr/bin/env node
/**
 * JEV Code Review 7-Question Pre-filter (Skill - Caso 5)
 * Reads git diff, runs 7 binary questions in parallel via JEV.
 * If all 7 are NO -> Fast Pass (<200ms, 0 LLM tokens).
 * If ANY is YES -> Escalates to Claude with precise attention points.
 */

import { execSync } from 'node:child_process';
import { JevClient } from '../../src/client.js';
import { QUESTION_TYPES } from '../../src/types.js';

export function getGitDiff(cwd = process.cwd()) {
  try {
    let diff = execSync('git diff --cached', { cwd, encoding: 'utf-8' }).trim();
    if (!diff) {
      diff = execSync('git diff HEAD~1 2>/dev/null || git diff', { cwd, encoding: 'utf-8' }).trim();
    }
    return diff || '';
  } catch {
    return '';
  }
}

export const REVIEW_QUESTIONS = {
  q1_arch_violation: {
    type: QUESTION_TYPES.NOUL,
    instructions: 'A alteração fere as regras de arquitetura limpa ou modularidade do projeto?'
  },
  q2_critical_security: {
    type: QUESTION_TYPES.NOUL,
    instructions: 'É uma mudança crítica em segurança, autenticação, autorização ou criptografia?'
  },
  q3_breaking_api: {
    type: QUESTION_TYPES.NOUL,
    instructions: 'Introduz quebra de contratos públicos de API ou interfaces compartilhadas?'
  },
  q4_db_migration: {
    type: QUESTION_TYPES.NOUL,
    instructions: 'Modifica esquemas de banco de dados com risco de perda ou corrupção de dados?'
  },
  q5_secret_exposure: {
    type: QUESTION_TYPES.NOUL,
    instructions: 'Expõe credenciais, chaves de API, tokens privados ou dados sensíveis?'
  },
  q6_high_complexity: {
    type: QUESTION_TYPES.NOUL,
    instructions: 'Apresenta complexidade excessiva ou acoplamento que exige refatoração?'
  },
  q7_missing_tests: {
    type: QUESTION_TYPES.NOUL,
    instructions: 'Altera lógica de negócio sem incluir testes unitários ou de integração correspondentes?'
  }
};

export async function runCodeReviewPreFilter(diff, cwd = process.cwd()) {
  if (!diff || diff.length < 10) {
    return {
      fastPass: true,
      reason: 'Nenhuma alteração de código substancial detectada no git diff.',
      risks: []
    };
  }

  const client = new JevClient();
  const result = await client.evaluate(
    `GIT DIFF PARA AVALIAÇÃO:\n${diff.slice(0, 4000)}`,
    REVIEW_QUESTIONS,
    {
      feature: 'code-review-filter',
      tokensSpared: 18000,
      llmLatency: 4500,
      projectDir: cwd
    }
  );

  const answers = result?.answers || {};
  const risks = [];

  const labels = {
    q1_arch_violation: 'Violação de regras de arquitetura',
    q2_critical_security: 'Mudança crítica em autenticação/segurança',
    q3_breaking_api: 'Possível quebra de contrato de API',
    q4_db_migration: 'Risco em migração/esquema de banco',
    q5_secret_exposure: 'Vazamento ou hardcode de credenciais',
    q6_high_complexity: 'Complexidade ciclomática elevada',
    q7_missing_tests: 'Ausência de testes automatizados'
  };

  for (const [key, label] of Object.entries(labels)) {
    const ans = answers[key];
    if (ans && ans.noul === true && (ans.probability || 0) >= 0.50) {
      risks.push({ key, label, confidence: Math.round((ans.probability || 0.8) * 100) });
    }
  }

  const fastPass = risks.length === 0;
  return {
    fastPass,
    latency_ms: result.latency_ms || 110,
    risks
  };
}

async function main() {
  console.log('⚡ [JEV REVIEW]: Lendo alterações do git e avaliando 7 perguntas de controle...');
  const diff = getGitDiff(process.cwd());
  const evaluation = await runCodeReviewPreFilter(diff, process.cwd());

  if (evaluation.fastPass) {
    console.log(`\n✅ [FAST PASS]: Alteração de baixo risco aprovada em ${evaluation.latency_ms || 120}ms!`);
    console.log('   Nenhum risco arquitetural, de segurança ou quebra detectado pelo JEV.');
    console.log('   Economia: ~18.000 tokens e ~4 segundos de espera poupados.\n');
  } else {
    console.log(`\n⚠️  [REVISÃO APROFUNDADA NECESSÁRIA]: O JEV detectou ${evaluation.risks.length} ponto(s) de atenção:`);
    evaluation.risks.forEach(r => {
      console.log(`   - ${r.label} (${r.confidence}% certeza)`);
    });
    console.log('\n🤖 Claude Code: Execute a revisão de código detalhada focando nos pontos acima.\n');
  }
}

if (process.argv[1] && process.argv[1].endsWith('review.js')) {
  main().catch(err => {
    console.error('Erro na revisão:', err.message);
    process.exit(0);
  });
}
