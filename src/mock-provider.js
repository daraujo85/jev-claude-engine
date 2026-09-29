import { QUESTION_TYPES } from './types.js';

/**
 * Deterministic Mock Provider for offline local testing and CI
 */
export function evaluateMock(state, questions) {
  const stateLower = (state || '').toLowerCase();
  const answers = {};

  for (const [key, q] of Object.entries(questions)) {
    if (q.type === QUESTION_TYPES.CHOICE) {
      const keys = Object.keys(q.criteria || {});
      // Pick best matching option based on keyword overlap
      let bestKey = keys[0] || 'none';
      let maxScore = -1;

      for (const optKey of keys) {
        const desc = (q.criteria[optKey] || '').toLowerCase();
        let matches = 0;
        const words = optKey.split(/[-_]/).concat(desc.split(/\s+/));
        for (const w of words) {
          if (w.length > 2 && stateLower.includes(w)) {
            matches += 1;
          }
        }
        if (matches > maxScore) {
          maxScore = matches;
          bestKey = optKey;
        }
      }

      answers[key] = {
        type: QUESTION_TYPES.CHOICE,
        choice: bestKey,
        confidence: maxScore > 0 ? 0.92 : 0.75,
        probabilities: keys.reduce((acc, k) => {
          acc[k] = k === bestKey ? 0.85 : 0.15 / (keys.length || 1);
          return acc;
        }, {})
      };
    } else if (q.type === QUESTION_TYPES.NOUL) {
      // Evaluate boolean query
      const instrLower = (q.instructions || '').toLowerCase();
      let isTrue = false;
      let prob = 0.15;

      // Detection rules for Anti-Hallucination & Guardrails
      if (instrLower.includes('viola') || instrLower.includes('violate') || instrLower.includes('quebra') || instrLower.includes('rule') || instrLower.includes('regr')) {
        // If state explicitly contains rule breaking patterns (e.g. "import forbidden", "direct db query in controller")
        if (stateLower.includes('violat') || stateLower.includes('forbidden') || stateLower.includes('break_rule') || stateLower.includes('bypasstest')) {
          isTrue = true;
          prob = 0.95;
        } else {
          isTrue = false;
          prob = 0.08;
        }
      } else if (instrLower.includes('urgent') || instrLower.includes('critical')) {
        isTrue = stateLower.includes('urgent') || stateLower.includes('critical') || stateLower.includes('error');
        prob = isTrue ? 0.91 : 0.10;
      } else if (instrLower.includes('test') && instrLower.includes('covered')) {
        isTrue = stateLower.includes('test') || stateLower.includes('spec') || stateLower.includes('assert');
        prob = isTrue ? 0.88 : 0.20;
      } else if (instrLower.includes('keep') || instrLower.includes('important')) {
        isTrue = stateLower.includes('todo') || stateLower.includes('error') || stateLower.includes('function') || stateLower.includes('decision');
        prob = isTrue ? 0.89 : 0.35;
      }

      answers[key] = {
        type: QUESTION_TYPES.NOUL,
        noul: isTrue,
        probability: prob,
        confidence: 0.90
      };
    } else if (q.type === QUESTION_TYPES.SCORE) {
      // Numerical score 1-10
      let score = 5;
      if (stateLower.includes('auth') || stateLower.includes('token') || stateLower.includes('security')) {
        score = 9.2;
      } else if (stateLower.includes('helper') || stateLower.includes('util')) {
        score = 6.5;
      } else {
        score = 4.0;
      }

      answers[key] = {
        type: QUESTION_TYPES.SCORE,
        score: score,
        confidence: 0.88
      };
    }
  }

  return {
    model: 'jev-mock-v1',
    latency_ms: 12,
    answers
  };
}
