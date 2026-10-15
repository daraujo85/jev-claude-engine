#!/usr/bin/env node
/**
 * JEV Bugfix Plan & Hypothesis Evaluator
 * Evaluates whether an agent's proposed plan truly solves the root cause
 * of a reported problem or if it just superficially masks symptoms.
 */

import { JevClient } from '../../src/client.js';
import { QUESTION_TYPES } from '../../src/types.js';
import { renderJevCard } from '../../src/ui.js';

export const EVALUATOR_QUESTIONS = {
  verdict: {
    type: QUESTION_TYPES.CHOICE,
    instructions: 'Classifique a eficácia e segurança deste plano de bugfix:',
    criteria: {
      optimal: 'Resolve a causa-raiz com segurança, boa arquitetura e baixo risco',
      symptom_patch: 'Apenas mascara o sintoma superficialmente sem resolver a causa-raiz no sistema',
      high_regression_risk: 'Altera contratos ou código funcional prévio com risco severo de quebrar outros fluxos',
      ineffective: 'Não atende nem resolve o problema relatado'
    }
  },
  solves_root_cause: {
    type: QUESTION_TYPES.NOUL,
    instructions: 'O plano ataca a causa fundamental do problema ao invés de aplicar apenas um remendo superficial?'
  },
  solidez: {
    type: QUESTION_TYPES.SCORE,
    instructions: 'Avalie a solidez técnica e probabilidade de sucesso deste plano:',
    criteria: [
      'Muito fraco, ineficaz ou gera regressão severa',
      'Paliativo/superficial, causa-raiz permanece',
      'Razoável mas incompleto para casos de borda',
      'Bom e seguro, resolve a causa direta',
      'Excelente, definitivo, com idempotência e robustez'
    ]
  }
};

export async function evaluatePlan(problemContext, proposedPlan, cwd = process.cwd()) {
  const client = new JevClient();

  const state = `
CONTEXTO DO PROBLEMA / SINTOMA DO BUG:
${problemContext.trim()}

PLANO DE AÇÃO PROPOSTO PELA IA:
${proposedPlan.trim()}
`;

  const result = await client.evaluate(state, EVALUATOR_QUESTIONS, {
    feature: 'plan-evaluator',
    tokensSpared: 12000,
    llmLatency: 3500,
    projectDir: cwd
  });

  const answers = result?.answers || {};
  const verdict = answers.verdict?.choice || 'unknown';
  const confidence = answers.verdict?.confidence || 0.8;
  const solvesRoot = answers.solves_root_cause?.noul === true;
  const rootProb = answers.solves_root_cause?.probability || 0.5;
  const scoreVal = typeof answers.solidez?.score === 'number' ? answers.solidez.score : 2.5;

  const isApproved = verdict === 'optimal' && solvesRoot && scoreVal >= 2.5;

  return {
    isApproved,
    verdict,
    confidence,
    solvesRoot,
    rootProb,
    score: scoreVal,
    latencyMs: result.latency_ms || 120,
    probabilities: answers.verdict?.probabilities || {}
  };
}

async function main() {
  const args = process.argv.slice(2);
  const problem = args[0] || 'Usuários relatam que cliques repetidos cobram duas vezes.';
  const plan = args[1] || 'Desabilitar botão no frontend.';

  console.log('🧠 [JEV PLAN EVALUATOR]: Analisando hipótese e probabilidade de sucesso do plano...');

  const evalResult = await evaluatePlan(problem, plan, process.cwd());

  const verdictLabels = {
    optimal: '✅ ÓTIMO: Resolve a causa-raiz com segurança',
    symptom_patch: '⚠️ SINTOMA: Apenas mascara o problema superficialmente',
    high_regression_risk: '🚨 RISCO ALTO: Pode causar regressão em código funcional',
    ineffective: '❌ INEFICAZ: Não resolve o problema relatado'
  };

  const card = renderJevCard({
    feature: 'Validação de Plano de Bugfix',
    target: problem.slice(0, 30),
    latencyMs: evalResult.latencyMs,
    confidence: evalResult.confidence,
    decision: verdictLabels[evalResult.verdict] || evalResult.verdict,
    probabilities: evalResult.probabilities,
    tokensSaved: 12000,
    details: [
      `🎯 Causa-Raiz Endereçada: ${evalResult.solvesRoot ? 'SIM' : 'NÃO'} (${Math.round(evalResult.rootProb * 100)}% certeza)`,
      `📊 Solidez Técnica: ${evalResult.score.toFixed(1)}/4.0`,
      evalResult.isApproved
        ? '🟢 Plano aprovado para implementação.'
        : '🔴 ATENÇÃO: Refaça o plano atacando a causa-raiz antes de escrever código!'
    ]
  });

  console.log(card);
}

if (process.argv[1] && process.argv[1].endsWith('evaluator.js')) {
  main().catch(err => {
    console.error('Erro na avaliação do plano:', err.message);
    process.exit(0);
  });
}
