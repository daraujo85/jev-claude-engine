#!/usr/bin/env node
/**
 * JEV Fast Compaction for Antigravity (AGY)
 * Listens on PreCompact, decides whether the history holds critical
 * content, and returns custom_instructions to guide the summarizer.
 */

import { JevClient } from '/Users/diegoaraujo/Documents/projects/jev-claude-engine/src/client.js';
import { QUESTION_TYPES } from '/Users/diegoaraujo/Documents/projects/jev-claude-engine/src/types.js';
import { loadConfig, isEnabled } from '/Users/diegoaraujo/Documents/projects/jev-claude-engine/src/jev-config.js';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  if (!input.trim()) process.exit(0);

  let sessionData = {};
  try { sessionData = JSON.parse(input); } catch { process.exit(0); }

  const cfg = loadConfig();
  if (!isEnabled(cfg, 'hooks', 'jev-fast-compact')) process.exit(0);
  const hookCfg = cfg?.hooks?.['jev-fast-compact'] || {};
  const usageThreshold = typeof hookCfg.usage_threshold === 'number' ? hookCfg.usage_threshold : 25;

  const usagePct =
    sessionData.context_utilization ||
    (sessionData.tokens_used && sessionData.context_window
      ? Math.round((sessionData.tokens_used / sessionData.context_window) * 100)
      : (sessionData.tokens_used || 0) > 50000 ? 30 : 15);
  if (usagePct <= usageThreshold) process.exit(0);

  const client = new JevClient();
  const result = await client.evaluate(
    `Sessão: ${sessionData.session_id || ''} | Utilização: ${usagePct}%`,
    {
      keep_critical: {
        type: QUESTION_TYPES.NOUL,
        instructions: 'O histórico contém decisões de arquitetura ativas, regras de projeto, TODOs ou diffs críticos que devem ser preservados na compactação?'
      },
      instructions: {
        type: QUESTION_TYPES.CHOICE,
        instructions: 'Qual orientação de compactação preserva melhor o que importa?',
        criteria: {
          preserve_decisions: 'Preservar decisões, regras, TODOs e diffs; resumir o resto',
          preserve_all: 'Preservar tudo de relevante',
          default_summary: 'Resumo padrão'
        }
      }
    },
    { feature: 'fast-compact' }
  );

  const keep = result?.answers?.keep_critical;
  const guidance = result?.answers?.instructions;
  if (!keep || !guidance || !guidance.choice) process.exit(0);

  let customInstructions = 'Resumo padrão, mas não descarte decisões de arquitetura ou regras de projeto.';
  if (guidance.choice === 'preserve_all' || (keep.noul === true && guidance.choice === 'preserve_decisions')) {
    customInstructions = 'Na compactação, preserve explicitamente: decisões de arquitetura e motivos, regras do projeto, TODOs pendentes, caminhos de arquivos alterados. Resuma o resto de forma concisa.';
  }

  process.stdout.write(JSON.stringify({
    systemMessage: `[JEV] Fast Compaction em ${result.latency_ms || 120}ms — ${guidance.choice}`,
    hookSpecificOutput: {
      hookEventName: 'PreCompact',
      custom_instructions: customInstructions
    }
  }));
  process.exit(0);
}

main().catch(() => process.exit(0));