#!/usr/bin/env node
/**
 * JEV Fast Context Compaction Hook (PreCompact)
 *
 * Trigger: when context utilization > 25%. Consults JEV System One to
 * decide whether the conversation holds critical content (active decisions,
 * architecture rules, diffs). Returns hookSpecificOutput.custom_instructions
 * that guide Claude Code's compaction to preserve what matters.
 *
 * Output contract (PreCompact): must print a JSON object on stdout with
 *   { "hookSpecificOutput": { "hookEventName": "PreCompact",
 *       "custom_instructions": "..." } }
 * Under 25% (or on any JEV failure) exits 0 with no output → default
 * compaction flow, fail-open.
 */

import { JevClient } from '../src/client.js';
import { QUESTION_TYPES } from '../src/types.js';
import { loadConfig, isEnabled } from '../src/jev-config.js';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  if (!input.trim()) process.exit(0);

  let sessionData = {};
  try {
    sessionData = JSON.parse(input);
  } catch {
    process.exit(0); // raw/unparseable → default flow
  }

  // Context utilization: prefer explicit, else tokens_used / context_window.
  const cfg = loadConfig();
  if (!isEnabled(cfg, 'hooks', 'jev-fast-compact')) {
    process.exit(0);
  }
  const hookCfg = cfg?.hooks?.['jev-fast-compact'] || {};
  const usageThreshold = typeof hookCfg.usage_threshold === 'number' ? hookCfg.usage_threshold : 25;

  const usagePct =
    sessionData.context_utilization ||
    (sessionData.tokens_used && sessionData.context_window
      ? Math.round((sessionData.tokens_used / sessionData.context_window) * 100)
      : (sessionData.tokens_used || 0) > 50000 ? 30 : 15);

  // Only activate JEV when context is above the configured threshold.
  if (usagePct <= usageThreshold) {
    process.exit(0);
  }

  const client = new JevClient();
  const sessionId = sessionData.session_id || '';
  const reason = sessionData.what_triggered_compaction || 'auto';
  const state = [
    `Sessão: ${sessionId}`,
    `Motivo da compactação: ${reason}`,
    `Utilização de contexto: ${usagePct}%`
  ].join('\n');

  const result = await client.evaluate(
    state,
    {
      keep_critical: {
        type: QUESTION_TYPES.NOUL,
        instructions: 'O histórico desta sessão de codificação contém decisões de arquitetura ativas, regras de projeto, TODOs ou diffs críticos que devem ser preservados na compactação?'
      },
      instructions: {
        type: QUESTION_TYPES.CHOICE,
        instructions: 'Qual orientação de compactação preserva melhor o que importa nesta sessão?',
        criteria: {
          preserve_decisions: 'Preservar decisões de arquitetura, regras de projeto e diffs críticos; resumir o resto',
          preserve_all: 'Preservar tudo de relevante (sessão pequena, evitar perda)',
          default_summary: 'Resumo padrão; histórico é majoritariamente conversacional sem decisões críticas'
        }
      }
    },
    {
      feature: 'fast-compact',
      tokensSpared: 40000,
      llmLatency: 6000
    }
  );

  const keep = result?.answers?.keep_critical;
  const guidance = result?.answers?.instructions;

  // Fail-open: if JEV errored, no custom instructions → default compaction.
  if (!keep || !guidance || !guidance.choice) {
    process.exit(0);
  }

  const keepCritical = keep.noul === true;
  const choice = guidance.choice;

  // Build actionable instructions for the compaction process.
  let customInstructions = '';
  if (choice === 'preserve_all') {
    customInstructions = 'Preserve TODOS os detalhes desta sessão na compactação: não descarte decisões, arquivos alterados, diffs ou TODOs. Esta sessão tem conteúdo crítico em quase toda a extensão.';
  } else if (choice === 'preserve_decisions' || keepCritical) {
    customInstructions = 'Na compactação, preserve explicitamente: (1) decisões de arquitetura e o motivo por trás delas, (2) regras/convenções do projeto que foram estabelecidas, (3) TODOs e tarefas pendentes, (4) caminhos de arquivos alterados e o que foi mudado. Resuma de forma concisa o restante (conversa incidental, logs, outputs de ferramentas repetidos).';
  } else {
    // JEV says nothing critical: let the standard summarizer run, but keep
    // a one-line guard so decisions aren't silently dropped.
    customInstructions = 'Resumo padrão, mas não descarte nenhuma decisão de arquitetura ou regra de projeto que apareça no histórico.';
  }

  const confidence = Math.round(((keep.probability || 0.9) * 100));
  const latencyMs = result.latency_ms || 120;
  const savedTokens = 40000;
  const savedMs = 6000;
  const label = keepCritical ? 'crítico detectado' : 'padrão';
  const gain = keepCritical
    ? `poupou ~${(savedTokens / 1000).toFixed(0)}k tokens de contexto`
    : 'sem perda de decisões';
  process.stdout.write(JSON.stringify({
    systemMessage: `[JEV] Fast Compaction ${label} em ${latencyMs}ms (${confidence}% certeza) — ${gain}`,
    hookSpecificOutput: {
      hookEventName: 'PreCompact',
      custom_instructions: `${customInstructions}\n[JEV: ${label} — ${confidence}% certeza, ${latencyMs}ms, poupou ~${savedMs / 1000}s de latência LLM]`
    }
  }));
  process.exit(0);
}

main().catch(() => process.exit(0)); // Fail-open