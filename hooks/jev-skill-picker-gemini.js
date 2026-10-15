#!/usr/bin/env node
/**
 * JEV Skill Picker for Antigravity (AGY)
 * Listens on UserPromptSubmit, asks JEV which skill matches, and injects
 * a routing directive as additionalContext so AGY loads only that skill.
 */

import { JevClient } from '/Users/diegoaraujo/Documents/projects/jev-claude-engine/src/client.js';
import { scanInstalledSkills } from '/Users/diegoaraujo/Documents/projects/jev-claude-engine/src/skills-scanner.js';
import { QUESTION_TYPES } from '/Users/diegoaraujo/Documents/projects/jev-claude-engine/src/types.js';
import { loadConfig, isEnabled } from '/Users/diegoaraujo/Documents/projects/jev-claude-engine/src/jev-config.js';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  if (!input.trim()) { process.exit(0); }

  let prompt = input;
  try {
    const j = JSON.parse(input);
    prompt = j.prompt || j.user_prompt || j.text || input;
  } catch { /* raw */ }

  const cfg = loadConfig();
  if (!isEnabled(cfg, 'hooks', 'jev-skill-picker')) process.exit(0);
  const hookCfg = cfg?.hooks?.['jev-skill-picker'] || {};
  const confThreshold = typeof hookCfg.confidence_threshold === 'number' ? hookCfg.confidence_threshold : 0.50;
  const minSkills = typeof hookCfg.min_skills === 'number' ? hookCfg.min_skills : 5;

  const skills = scanInstalledSkills();
  if (!skills || skills.length < minSkills) process.exit(0);

  const criteria = { none: 'Nenhuma skill especializada para este prompt' };
  for (const s of skills.slice(0, 50)) criteria[s.id] = (s.description || s.name || s.id).slice(0, 100);

  const client = new JevClient();
  const result = await client.evaluate(`Prompt do usuário: ${prompt}`, {
    selected_skill: {
      type: QUESTION_TYPES.CHOICE,
      instructions: 'Selecione a única skill mais relevante para atender a este prompt ou "none" se nenhuma se aplicar diretamente.',
      criteria
    }
  }, { feature: 'skill-picker' });

  const answer = result?.answers?.selected_skill;
  const confidence = answer?.confidence || 0;
  const choiceProb = answer?.probabilities?.[answer?.choice] || confidence;
  if (answer && answer.choice && answer.choice !== 'none' && (confidence >= confThreshold || choiceProb >= confThreshold)) {
    const prob = Math.max(confidence, choiceProb);
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: `[JEV ROUTER: Invocar skill '${answer.choice}' (${Math.round(prob * 100)}% certeza). Não carregar outras skills.]`
      }
    }));
  }
  process.exit(0);
}

main().catch(() => process.exit(0));