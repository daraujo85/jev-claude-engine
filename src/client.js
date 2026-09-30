import { validatePayload, PROVIDERS } from './types.js';
import { resolveProviderConfig } from './providers.js';
import { evaluateMock } from './mock-provider.js';
import { recordTelemetry } from './telemetry.js';

export class JevClient {
  constructor(options = {}) {
    this.config = resolveProviderConfig(options);
  }

  async evaluate(state, questions, meta = {}) {
    const startTime = Date.now();
    validatePayload({ state, questions });

    // Handle mock provider
    if (this.config.provider === PROVIDERS.MOCK) {
      const result = evaluateMock(state, questions);
      const latency = Date.now() - startTime;
      result.latency_ms = latency;

      recordTelemetry({
        feature: meta.feature || 'unknown',
        provider: 'mock',
        jev_latency_ms: latency,
        estimated_llm_tokens_saved: meta.tokensSpared || 15000,
        estimated_llm_latency_ms: meta.llmLatency || 3200,
        status: 'success'
      }, meta.projectDir);

      return result;
    }

    // Live HTTP request
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs || 1500);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: 'jev-latest',
          state,
          questions
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);
      const latency = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`JEV API responded with status ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      data.latency_ms = latency;

      // Normalize live JEV noul answers
      if (data && data.answers) {
        for (const [k, ans] of Object.entries(data.answers)) {
          if (ans && ans.type === 'noul') {
            const raw = ans.noul;
            const prob = typeof ans.probability === 'number'
              ? ans.probability
              : (typeof raw === 'number' ? raw : (raw ? 1.0 : 0.0));
            ans.noul = typeof raw === 'boolean' ? raw : raw >= 0.50;
            ans.probability = prob;
          }
        }
      }

      // Real JEV cost from actual input tokens (JEV = $0.04/M input, $0 output).
      // Falls back to a fixed estimate when the API omits usage.
      const inputTokens = data?.usage?.input_tokens || meta.inputTokens || 0;
      const jevCostUsd = inputTokens > 0
        ? (inputTokens / 1_000_000) * 0.04
        : 0.000008;

      recordTelemetry({
        feature: meta.feature || 'unknown',
        provider: this.config.provider,
        jev_latency_ms: latency,
        jev_input_tokens: inputTokens,
        jev_cost_usd: Number(jevCostUsd.toFixed(8)),
        input_preview: meta.inputPreview || truncatePreview(state),
        estimated_llm_tokens_saved: meta.tokensSpared || 15000,
        estimated_llm_latency_ms: meta.llmLatency || 3200,
        status: 'success'
      }, meta.projectDir);

      return data;
    } catch (err) {
      clearTimeout(timeout);
      const latency = Date.now() - startTime;

      recordTelemetry({
        feature: meta.feature || 'unknown',
        provider: this.config.provider,
        jev_latency_ms: latency,
        status: err.name === 'AbortError' ? 'timeout' : 'error'
      }, meta.projectDir);

      // Fail-open response structure
      return {
        model: 'jev-fallback',
        latency_ms: latency,
        fallback: true,
        error: err.message,
        answers: {}
      };
    }
  }
}

function truncatePreview(s, max = 280) {
  if (typeof s !== 'string' || !s.trim()) return '';
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max) + '…' : oneLine;
}
