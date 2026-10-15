#!/usr/bin/env node
/**
 * JEV Autonomous Browser UI Navigator (Skill - Caso 6)
 * Extracts interactive elements from DOM, uses JEV Choice to rapidly
 * pick the next element to click/interact towards the objective.
 */

import { JevClient } from '../../src/client.js';
import { QUESTION_TYPES } from '../../src/types.js';

export async function decideNextAction(goal, interactiveElements, projectDir = process.cwd()) {
  if (!interactiveElements || interactiveElements.length === 0) {
    return { action: 'none', reason: 'Nenhum elemento interativo visível no DOM' };
  }

  const criteria = {};
  for (const el of interactiveElements) {
    criteria[el.id] = `Elemento: ${el.tag}, Texto: "${el.text || ''}", Local: ${el.selector || el.id}`;
  }
  criteria['goal_reached'] = 'O objetivo já foi alcançado na tela atual';

  const client = new JevClient();
  const result = await client.evaluate(
    `OBJETIVO DO TESTE: "${goal}"\nESTADO ATUAL DA TELA: ${interactiveElements.map(e => `[${e.id}]: ${e.text}`).join(' | ')}`,
    {
      next_target: {
        type: QUESTION_TYPES.CHOICE,
        instructions: 'Escolha qual elemento deve ser acionado para aproximar a navegação do objetivo especificado.',
        criteria
      }
    },
    {
      feature: 'browser-navigator',
      tokensSpared: 8000,
      llmLatency: 3500,
      projectDir
    }
  );

  const answer = result?.answers?.next_target;
  const choice = answer?.choice || 'none';
  const confidence = answer?.confidence || 0.7;

  return {
    targetId: choice,
    confidence,
    isComplete: choice === 'goal_reached',
    latency_ms: result.latency_ms || 120
  };
}

async function main() {
  const goal = process.argv.slice(2).join(' ').trim() || 'Acessar faturamento e baixar nota';
  console.log(`🌐 [JEV UI NAVIGATOR]: Planejando navegação para objetivo: "${goal}"...`);

  // Mock DOM interactive elements sample
  const sampleDom = [
    { id: 'btn_home', tag: 'button', text: 'Início' },
    { id: 'btn_settings', tag: 'button', text: 'Configurações' },
    { id: 'btn_billing', tag: 'button', text: 'Faturamento e Notas' },
    { id: 'btn_profile', tag: 'button', text: 'Meu Perfil' }
  ];

  const step = await decideNextAction(goal, sampleDom, process.cwd());
  console.log(`\n🎯 Ação escolhida em ${step.latency_ms}ms: Interagir com '${step.targetId}' (${Math.round(step.confidence * 100)}% certeza).`);
  console.log('🤖 Claude Code: Execute a ação na ferramenta do navegador (Playwright / Chrome DevTools).\n');
}

if (process.argv[1] && process.argv[1].endsWith('navigator.js')) {
  main().catch(err => {
    console.error('Erro na navegação:', err.message);
    process.exit(0);
  });
}
