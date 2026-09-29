import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTION_TYPES, validateQuestion, validatePayload } from '../src/types.js';

test('T1: validateQuestion accepts valid choice, noul and score primitives', () => {
  assert.equal(validateQuestion('choice_q', {
    type: QUESTION_TYPES.CHOICE,
    instructions: 'Select tool',
    criteria: { tool1: 'tool 1', tool2: 'tool 2' }
  }), true);

  assert.equal(validateQuestion('noul_q', {
    type: QUESTION_TYPES.NOUL,
    instructions: 'Is urgent?'
  }), true);

  assert.equal(validateQuestion('score_q', {
    type: QUESTION_TYPES.SCORE,
    instructions: 'Score 1 to 10',
    min: 1,
    max: 10
  }), true);
});

test('T1: validateQuestion rejects invalid schemas', () => {
  assert.throws(() => validateQuestion('bad_type', { type: 'invalid', instructions: 'x' }));
  assert.throws(() => validateQuestion('missing_criteria', { type: QUESTION_TYPES.CHOICE, instructions: 'x' }));
  assert.throws(() => validateQuestion('missing_instr', { type: QUESTION_TYPES.NOUL }));
});

test('T1: validatePayload checks state and questions container', () => {
  assert.throws(() => validatePayload({}));
  assert.throws(() => validatePayload({ state: 'sample' }));
  assert.equal(validatePayload({
    state: 'Sample state',
    questions: {
      urgent: { type: QUESTION_TYPES.NOUL, instructions: 'Is urgent?' }
    }
  }), true);
});
