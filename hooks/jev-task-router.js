#!/usr/bin/env node
/**
 * JEV Task Router Hook (UserPromptSubmit)
 * Classifies the incoming prompt into a JEV task type, maps it to the
 * right 9Router combo, and injects a delegation directive so Claude Code
 * routes the work to the matching subagent (which runs on that combo).
 *
 * Contract: UserPromptSubmit → stdout JSON { systemMessage, hookSpecificOutput.additionalContext }
 */
import { routeToSubagent } from '../src/task-router.js';
import { renderJevCard } from '../src/ui.js';
import { loadConfig, isEnabled } from '../src/jev-config.js';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  if (!input.trim()) process.exit(0);

  let prompt = input;
  try {
    const json = JSON.parse(input);
    prompt = json.prompt || json.user_prompt || json.content || input;
  } catch { /* raw text */ }

  const cfg = loadConfig();
  if (!isEnabled(cfg, 'hooks', 'jev-task-router')) process.exit(0);
  const hookCfg = cfg?.hooks?.['jev-task-router'] || {};
  const confThreshold = typeof hookCfg.confidence_threshold === 'number' ? hookCfg.confidence_threshold : 0.55;

  const r = await routeToSubagent(prompt);
  if (!r.combo || r.task === 'none' || r.probability < confThreshold) {
    process.stdout.write(JSON.stringify({
      systemMessage: `[JEV] Task Router: ${r.task === 'none' ? 'tarefa geral, sem subagent dedicado' : `'${r.task}' (${Math.round((r.probability || 0) * 100)}%, combo ${r.combo || '—'}) abaixo do limiar — segue no modelo principal`} · ${r.latency_ms}ms`
    }));
    process.exit(0);
  }

  const card = renderJevCard({
    feature: 'Task Router',
    target: r.subagent,
    latencyMs: r.latency_ms,
    confidence: r.probability,
    decision: `Delegar pra '${r.subagent}' (combo ${r.combo})`,
    tokensSaved: 0
  });
  process.stderr.write(card);

  process.stdout.write(JSON.stringify({
    systemMessage: `[JEV] Task Router: delegou pra '${r.subagent}' via combo ${r.combo} (${Math.round(r.probability * 100)}% certeza, ${r.latency_ms}ms)`,
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: `[JEV ROUTER: Tarefa = ${r.task} (${Math.round(r.probability * 100)}%). Delegar esta tarefa ao subagent '${r.subagent}' — ele roda no combo '${r.combo}'. Não executar inline se a tarefa for grande.]
        Arquitetura do projeto: se existir um perfil em ${process.env.CLAUDE_PROJECT_DIR || '.'}/.claude/jev-profile.md, o subagent deve lê-lo ANTES de escrever código para seguir a arquitetura e o code style do projeto.`
    }
  }));
  process.exit(0);
}

main().catch(() => process.exit(0)); // Fail-open