#!/usr/bin/env node
/**
 * JEV Skill Picker Hook (UserPromptSubmit)
 * Evaluates incoming user prompt against installed skills and injects
 * a precise routing directive so Claude doesn't load 90+ skill definitions.
 */

import { JevClient } from '../src/client.js';
import { scanInstalledSkills } from '../src/skills-scanner.js';
import { QUESTION_TYPES } from '../src/types.js';
import { renderJevCard } from '../src/ui.js';

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

  const skills = scanInstalledSkills();
  if (!skills || skills.length < 5) {
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
  if (answer && answer.choice && answer.choice !== 'none' && (answer.confidence || 0) >= 0.70) {
    const card = renderJevCard({
      feature: 'Skill Picker Router',
      target: answer.choice,
      latencyMs: result.latency_ms || 115,
      confidence: answer.confidence || 0.9,
      decision: `Invocando skill: '${answer.choice}'`,
      probabilities: answer.probabilities,
      tokensSaved: skills.length * 350
    });

    process.stderr.write(card);
    process.stdout.write(
      `\n[JEV ROUTER: Invocar skill '${answer.choice}' (${Math.round((answer.confidence || 0) * 100)}% certeza). Não carregar outras skills.]\n`
    );
  }

  process.exit(0);
}

main().catch(() => process.exit(0)); // Fail-open
