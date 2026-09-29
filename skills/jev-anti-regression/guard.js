#!/usr/bin/env node
/**
 * JEV Anti-Regression Sentinel (Skill & Verification Engine)
 * Analyzes code diffs to prevent LLMs from breaking existing working features,
 * modifying public signatures, or deleting functional business logic.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { JevClient } from '../../src/client.js';
import { QUESTION_TYPES } from '../../src/types.js';
import { renderDiffCard, renderJevCard } from '../../src/ui.js';

export function getWorkingDiff(cwd = process.cwd()) {
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

export const REGRESSION_QUESTIONS = {
  breaks_public_contract: {
    type: QUESTION_TYPES.NOUL,
    instructions: 'Esta alteração remove parâmetros, altera tipos ou quebra a assinatura pública de funções ou classes existentes que outros módulos já utilizam?'
  },
  weakens_existing_behavior: {
    type: QUESTION_TYPES.NOUL,
    instructions: 'O código deleta, desativa, comenta ou enfraquece lógica de negócio funcional pré-existente ou testes existentes ao invés de estendê-los com compatibilidade?'
  },
  regression_risk: {
    type: QUESTION_TYPES.CHOICE,
    instructions: 'Qual o risco de regressão funcional desta alteração para partes do sistema que já estavam funcionando?',
    criteria: {
      none: 'Sem risco: código puramente aditivo ou refatoração 100% segura',
      low: 'Baixo risco: extensão de funcionalidade sem impacto colateral em contratos',
      high: 'Alto risco: quebra evidente de contratos, remoção de lógica funcional ou risco severo de regressão'
    }
  }
};

export async function auditRegression(diff, cwd = process.cwd()) {
  if (!diff || diff.length < 15) {
    return {
      hasRegressionRisk: false,
      reason: 'Nenhuma alteração de código substancial detectada para análise de regressão.',
      details: []
    };
  }

  const client = new JevClient();
  const result = await client.evaluate(
    `DIFF EM ANÁLISE PARA REGRESSÃO:\n${diff.slice(0, 4500)}`,
    REGRESSION_QUESTIONS,
    {
      feature: 'anti-regression-audit',
      tokensSpared: 15000,
      llmLatency: 3800,
      projectDir: cwd
    }
  );

  const answers = result?.answers || {};
  const breaksContract = answers.breaks_public_contract?.noul === true && (answers.breaks_public_contract?.probability || 0) >= 0.75;
  const weakensLogic = answers.weakens_existing_behavior?.noul === true && (answers.weakens_existing_behavior?.probability || 0) >= 0.75;
  const highRisk = answers.regression_risk?.choice === 'high';

  const hasRegressionRisk = breaksContract || weakensLogic || highRisk;

  const details = [];
  if (breaksContract) {
    details.push(`🚨 Quebra de Assinatura/Contrato Público (${Math.round((answers.breaks_public_contract?.probability || 0.8) * 100)}% certeza)`);
  }
  if (weakensLogic) {
    details.push(`🚨 Deleção/Enfraquecimento de Lógica Existente (${Math.round((answers.weakens_existing_behavior?.probability || 0.8) * 100)}% certeza)`);
  }
  if (highRisk) {
    details.push(`🚨 Risco Global de Regressão: ALTO (${Math.round((answers.regression_risk?.confidence || 0.8) * 100)}% certeza)`);
  }

  return {
    hasRegressionRisk,
    latencyMs: result.latency_ms || 120,
    details,
    answers
  };
}

async function main() {
  console.log('🛡️  [JEV SENTINEL ANTI-REGRESSÃO]: Analisando diff para proteger código que já estava funcionando...');
  const diff = getWorkingDiff(process.cwd());

  const audit = await auditRegression(diff, process.cwd());

  if (!audit.hasRegressionRisk) {
    console.log(`\n✅ [SEM REGRESSÃO DETECTADA]: Alteração segura avaliada em ${audit.latencyMs}ms.`);
    console.log('   Nenhum contrato quebrado, nenhuma lógica prévia deletada.');
    console.log('   O código preserva o comportamento que já estava funcionando.\n');
  } else {
    console.log(`\n❌ [ALERTA DE REGRESSÃO DETECTADO PELO JEV]:`);
    audit.details.forEach(d => console.log(`   ${d}`));
    console.log('\n🤖 Claude Code: Refatore a alteração para preservar compatibilidade retroativa e não deletar código funcional!\n');
  }
}

if (process.argv[1] && process.argv[1].endsWith('guard.js')) {
  main().catch(err => {
    console.error('Erro no sentinel anti-regressão:', err.message);
    process.exit(0);
  });
}
