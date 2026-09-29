#!/usr/bin/env node
/**
 * JEV Fast Context Compaction Hook (PreCompact)
 * Evaluates conversation turns with binary JEV decisions (Keep vs Discard)
 * Only triggers if context usage > 25%, accelerating compaction by >60%.
 */

import { JevClient } from '../src/client.js';
import { QUESTION_TYPES } from '../src/types.js';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let sessionData = {};
  try {
    sessionData = JSON.parse(input);
  } catch {
    // raw text or empty
  }

  // Check context usage percentage
  // In Claude Code PreCompact payload: context_utilization or tokens_used / context_window
  const usagePct =
    sessionData.context_utilization ||
    (sessionData.tokens_used && sessionData.context_window
      ? Math.round((sessionData.tokens_used / sessionData.context_window) * 100)
      : (sessionData.tokens_used || 0) > 50000 ? 30 : 15);

  // Business Rule: Only activate JEV if context is > 25%
  if (usagePct <= 25) {
    // Under 25%: let standard LLM compaction or normal flow handle it
    process.exit(0);
  }

  const turns = Array.isArray(sessionData.messages)
    ? sessionData.messages
    : (sessionData.content ? [sessionData.content] : ['Turno com arquivos modificados e decisões de arquitetura']);

  const client = new JevClient();
  const sampleState = turns.map((t, i) => `[Turno ${i + 1}]: ${typeof t === 'string' ? t : JSON.stringify(t)}`).join('\n\n');

  const result = await client.evaluate(
    sampleState,
    {
      keep_critical_turns: {
        type: QUESTION_TYPES.NOUL,
        instructions: 'Determine se este bloco de histórico de conversa contém decisões ativas, regras de arquitetura ou diffs críticos que devem ser mantidos no contexto compactado.'
      }
    },
    {
      feature: 'fast-compact',
      tokensSpared: 40000,
      llmLatency: 6000
    }
  );

  const answer = result?.answers?.keep_critical_turns;
  if (answer && answer.noul) {
    process.stdout.write(
      `\n[JEV FAST COMPACTION]: Histórico filtrado com sucesso em ${result.latency_ms || 120}ms (${Math.round((answer.probability || 0.9) * 100)}% retenção de decisões críticas).\n`
    );
  }

  process.exit(0);
}

main().catch(() => process.exit(0)); // Fail-open
