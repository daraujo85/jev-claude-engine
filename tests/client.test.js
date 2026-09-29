import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JevClient } from '../src/client.js';
import { QUESTION_TYPES } from '../src/types.js';
import { readTelemetrySummary } from '../src/telemetry.js';

test('T2/T4: JevClient evaluates choice questions deterministically in mock mode', async () => {
  const client = new JevClient({ provider: 'mock' });
  const result = await client.evaluate(
    'Preciso rodar os testes unitarios do projeto',
    {
      selected_skill: {
        type: QUESTION_TYPES.CHOICE,
        instructions: 'Escolha a skill correta',
        criteria: {
          'test-runner': 'Executar testes automatizados e unitarios',
          'image-generator': 'Gerar imagens e graficos',
          'db-migrate': 'Migrar banco de dados'
        }
      }
    },
    { feature: 'skill-picker', tokensSpared: 20000 }
  );

  assert.equal(result.model, 'jev-mock-v1');
  assert.equal(result.answers.selected_skill.choice, 'test-runner');
  assert.ok(result.answers.selected_skill.confidence >= 0.70);
});

test('T2/T4: JevClient evaluates noul questions for rule enforcement', async () => {
  const client = new JevClient({ provider: 'mock' });

  // Safe diff
  const safeResult = await client.evaluate(
    'const x = 10; export default x;',
    {
      violates_rule: {
        type: QUESTION_TYPES.NOUL,
        instructions: 'Does this code violate architectural rules?'
      }
    },
    { feature: 'rule-guard' }
  );
  assert.equal(safeResult.answers.violates_rule.noul, false);

  // Violating diff
  const violatingResult = await client.evaluate(
    'import forbidden from "unauthorized-db"; // break_rule direct access',
    {
      violates_rule: {
        type: QUESTION_TYPES.NOUL,
        instructions: 'Does this code violate architectural rules?'
      }
    },
    { feature: 'rule-guard' }
  );
  assert.equal(violatingResult.answers.violates_rule.noul, true);
  assert.ok(violatingResult.answers.violates_rule.probability >= 0.80);
});

test('T5: Telemetry records decisions and calculates summary correctly', async () => {
  const summary = readTelemetrySummary();
  assert.ok(summary.total_decisions >= 2);
  assert.ok(summary.total_tokens_saved >= 20000);
});
