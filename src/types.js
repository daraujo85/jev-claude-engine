/**
 * JEV System One Protocol Types and Validators
 * Supporting Choice, Noul, and Score question primitives.
 */

export const QUESTION_TYPES = {
  CHOICE: 'choice',
  NOUL: 'noul',
  SCORE: 'score'
};

export const PROVIDERS = {
  TYPESAFE: 'typesafe',
  VERCEL: 'vercel',
  OPENROUTER: 'openrouter',
  MOCK: 'mock'
};

/**
 * Validates question payload against JEV protocol schema
 * @param {string} key Question identifier
 * @param {object} question Question specification
 */
export function validateQuestion(key, question) {
  if (!question || typeof question !== 'object') {
    throw new Error(`Invalid question object for key "${key}"`);
  }
  if (!question.type || !Object.values(QUESTION_TYPES).includes(question.type)) {
    throw new Error(`Question "${key}" has invalid or missing type: ${question.type}`);
  }
  if (!question.instructions || typeof question.instructions !== 'string') {
    throw new Error(`Question "${key}" missing instructions string`);
  }

  if (question.type === QUESTION_TYPES.CHOICE) {
    if (!question.criteria || typeof question.criteria !== 'object' || Object.keys(question.criteria).length === 0) {
      throw new Error(`Choice question "${key}" must provide a non-empty criteria map`);
    }
  }

  if (question.type === QUESTION_TYPES.SCORE) {
    if (!question.criteria || !Array.isArray(question.criteria)) {
      question.criteria = [
        'Muito fraco / ineficaz',
        'Superficial / paliativo',
        'Razoável / mediano',
        'Bom / resolve com segurança',
        'Excelente / definitivo e robusto'
      ];
    }
  }

  return true;
}

/**
 * Validates standard JEV request payload
 * @param {object} payload
 */
export function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be a non-null object');
  }
  if (!payload.state || typeof payload.state !== 'string') {
    throw new Error('Payload must include a non-empty state string');
  }
  if (!payload.questions || typeof payload.questions !== 'object' || Object.keys(payload.questions).length === 0) {
    throw new Error('Payload must contain at least one question');
  }

  for (const [key, q] of Object.entries(payload.questions)) {
    validateQuestion(key, q);
  }

  return true;
}
