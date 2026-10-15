#!/usr/bin/env node
/**
 * JEV Skill Picker Hook (UserPromptSubmit)
 * Evaluates incoming user prompt against installed skills and injects
 * a precise routing directive so Claude doesn't load 90+ skill definitions.
 */

import { JevClient } from '../src/client.js';
import { scanInstalledSkills } from '../src/skills-scanner.js';
import { readSkillsHub, buildSkillsHub } from '../src/skills-hub.js';
import { QUESTION_TYPES } from '../src/types.js';
import { renderJevCard } from '../src/ui.js';
import { loadConfig, isEnabled } from '../src/jev-config.js';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  if (!input.trim()) {
    process.exit(0);
  }

  let prompt = input;
  try {
    const json = JSON.parse(input);
    prompt = json.prompt || json.user_prompt || json.content || input;
  } catch {
    // raw text input
  }

  const cfg = loadConfig();
  if (!isEnabled(cfg, 'hooks', 'jev-skill-picker')) {
    process.exit(0);
  }
  const hookCfg = cfg?.hooks?.['jev-skill-picker'] || {};
  const confThreshold = typeof hookCfg.confidence_threshold === 'number' ? hookCfg.confidence_threshold : 0.50;
  const minSkills = typeof hookCfg.min_skills === 'number' ? hookCfg.min_skills : 5;

  // Modo enxuto: rotear pelo catálogo do JEV Skills Hub (a sessão só conhece
  // a skill jev-hub). Fallback para scanInstalledSkills se o hub não existir.
  const hubOn = isEnabled(cfg, 'hooks', 'jev-skills-hub');
  let skills;
  if (hubOn) {
    let hub = readSkillsHub();
    if (!hub) hub = buildSkillsHub(); // gera na primeira vez, fail-open
    skills = (hub?.skills || []).map((s) => ({ id: s.id, name: s.name, description: s.description }));
  } else {
    skills = scanInstalledSkills();
  }
  if (!skills || skills.length < minSkills) {
    // Not enough skills to warrant routing overhead
    process.exit(0);
  }

  // Build criteria map (capped at 50 to fit System One choice envelope)
  const criteria = {
    none: 'Nenhuma skill especializada necessaria para este prompt geral'
  };

  for (const s of skills.slice(0, 50)) {
    criteria[s.id] = (s.description || s.name || s.id).slice(0, 100);
  }

  const client = new JevClient();
  const result = await client.evaluate(
    `Prompt do usuário: ${prompt}`,
    {
      selected_skill: {
        type: QUESTION_TYPES.CHOICE,
        instructions: 'Selecione a única skill mais relevante para atender a este prompt ou "none" se nenhuma se aplicar diretamente.',
        criteria
      }
    },
    {
      feature: 'skill-picker',
      tokensSpared: skills.length * 350, // ~350 tokens per full skill spec spared
      llmLatency: 3500
    }
  );

  const answer = result?.answers?.selected_skill;
  const confidence = answer?.confidence || 0;
  const choiceProb = answer?.probabilities?.[answer?.choice] || confidence;
  const latency = result.latency_ms || 115;
  const tokensSaved = skills.length * 350;

  if (answer && answer.choice && answer.choice !== 'none' && (confidence >= confThreshold || choiceProb >= confThreshold)) {
    const effectiveProb = Math.max(confidence, choiceProb);
    const card = renderJevCard({
      feature: 'Skill Picker Router',
      target: answer.choice,
      latencyMs: latency,
      confidence: effectiveProb,
      decision: `Invocando skill: '${answer.choice}'`,
      probabilities: answer.probabilities,
      tokensSaved
    });

    process.stderr.write(card);
    // Contrato UserPromptSubmit: systemMessage (TUI) + additionalContext
    // (injetado no prompt do Claude, sem gastar tokens de skill defs).
    process.stdout.write(JSON.stringify({
      systemMessage: `[JEV] Skill Picker: roteou pra '${answer.choice}' (${Math.round(effectiveProb * 100)}% certeza, ${latency}ms) — poupou ~${tokensSaved.toLocaleString()} tokens de contexto`,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: `[JEV ROUTER: Invocar skill '${answer.choice}' (${Math.round(effectiveProb * 100)}% certeza). Não carregar outras skills.${hubOn ? ` Consultar '${answer.choice}' no catálogo ~/.jev/skills-hub/INDEX.md para o path, depois ler o SKILL.md apenas da skill escolhida.` : ''}]`
      }
    }));
  } else {
    // JEV consulted but no confident match — still show visual feedback
    // that the router evaluated the prompt.
    const decision = answer?.choice ? `nenhuma skill (${Math.round(choiceProb * 100)}% none)` : 'nenhuma skill';
    process.stdout.write(JSON.stringify({
      systemMessage: `[JEV] Skill Picker: avaliou prompt em ${latency}ms → ${decision}. ${skills.length} skills varridas, ~${tokensSaved.toLocaleString()} tokens não-carregados.`
    }));
  }

  process.exit(0);
}

main().catch(() => process.exit(0)); // Fail-open
