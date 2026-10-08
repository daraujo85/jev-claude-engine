/**
 * Model reference catalog — cost, latency and benchmark scores for the
 * models commonly exposed by 9Router. Used by the JEV model profiler to
 * weight cost/benefit, not just capabilities.
 *
 * Costs are USD per 1M tokens (input/output). Benchmarks are approximate
 * published scores (HumanEval / MMLU / GPQA / Arena) — enough for relative
 * ranking, not exact claims. Values that don't change often; update as the
 * market does.
 */
export const MODEL_CATALOG = {
  // ---- Anthropic Claude ----
  'cc/claude-opus-5-5':        { cost_in: 4,   cost_out: 20, latency: 'medium', benchmark: { human_eval: 97, mmlu: 93, gpqa: 89 } },
  'cc/claude-opus-5':          { cost_in: 15,  cost_out: 75, latency: 'high',   benchmark: { human_eval: 96, mmlu: 92, gpqa: 87 } },
  'cc/claude-fable-5-1':       { cost_in: 3,   cost_out: 15, latency: 'medium', benchmark: { human_eval: 92, mmlu: 88, gpqa: 82 } },
  'cc/claude-fable-5':         { cost_in: 3,   cost_out: 15, latency: 'medium', benchmark: { human_eval: 91, mmlu: 87, gpqa: 81 } },
  'cc/claude-sonnet-5-5':      { cost_in: 2,   cost_out: 10, latency: 'medium', benchmark: { human_eval: 95, mmlu: 91, gpqa: 86 } },
  'cc/claude-sonnet-5':        { cost_in: 3,   cost_out: 15, latency: 'medium', benchmark: { human_eval: 93, mmlu: 89, gpqa: 83 } },
  'cc/claude-haiku-5-5':       { cost_in: 0.1, cost_out: 0.5, latency: 'low',  benchmark: { human_eval: 88, mmlu: 85, gpqa: 75 } },
  'cc/claude-haiku-4-5-20251001': { cost_in: 0.8, cost_out: 4, latency: 'low', benchmark: { human_eval: 85, mmlu: 82, gpqa: 72 } },

  // ---- Google Gemini & Antigravity Claude ----
  'ag/claude-opus-5-5':        { cost_in: 0.1, cost_out: 0.5, latency: 'medium', benchmark: { human_eval: 97, mmlu: 93, gpqa: 89 } },
  'ag/claude-sonnet-5-5':      { cost_in: 0.1, cost_out: 0.5, latency: 'medium', benchmark: { human_eval: 95, mmlu: 91, gpqa: 86 } },
  'ag/claude-opus-4-6-thinking': { cost_in: 0.1, cost_out: 0.5, latency: 'high', benchmark: { human_eval: 95, mmlu: 91, gpqa: 85 } },
  'ag/claude-sonnet-4-6':      { cost_in: 0.1, cost_out: 0.5, latency: 'medium', benchmark: { human_eval: 92, mmlu: 88, gpqa: 82 } },
  'ag/gemini-3.8-flash':       { cost_in: 0.1, cost_out: 0.4, latency: 'low',   benchmark: { human_eval: 90, mmlu: 87, gpqa: 78 } },
  'ag/gemini-3.7-flash':       { cost_in: 0.1, cost_out: 0.4, latency: 'low',   benchmark: { human_eval: 88, mmlu: 85, gpqa: 75 } },
  'ag/gemini-3.6-flash':       { cost_in: 0.1, cost_out: 0.4, latency: 'low',   benchmark: { human_eval: 87, mmlu: 84, gpqa: 74 } },
  'ag/gemini-3.5-flash':       { cost_in: 0.1, cost_out: 0.4, latency: 'low',   benchmark: { human_eval: 86, mmlu: 83, gpqa: 73 } },
  'ag/gemini-3.1-pro':         { cost_in: 0.5, cost_out: 2.0, latency: 'medium', benchmark: { human_eval: 94, mmlu: 90, gpqa: 84 } },
  'ag/gemini-pro-agent':       { cost_in: 0.5, cost_out: 2.0, latency: 'medium', benchmark: { human_eval: 94, mmlu: 90, gpqa: 84 } },
  'ag/gpt-oss-120b-medium':    { cost_in: 0.1, cost_out: 0.4, latency: 'medium', benchmark: { human_eval: 88, mmlu: 84, gpqa: 75 } },

  // ---- OpenAI GPT / Codex ----
  'cx/gpt-6.1-sol':            { cost_in: 1.25, cost_out: 10, latency: 'medium', benchmark: { human_eval: 96, mmlu: 92, gpqa: 87 } },
  'cx/gpt-6-sol':              { cost_in: 1.25, cost_out: 10, latency: 'medium', benchmark: { human_eval: 95, mmlu: 91, gpqa: 86 } },
  'cx/gpt-6-astra':            { cost_in: 1.25, cost_out: 10, latency: 'medium', benchmark: { human_eval: 95, mmlu: 91, gpqa: 86 } },
  'cx/gpt-6-luna':             { cost_in: 0.8,  cost_out: 5,  latency: 'low',   benchmark: { human_eval: 92, mmlu: 88, gpqa: 80 } },
  'cx/gpt-5.6-sol':            { cost_in: 1.25, cost_out: 10, latency: 'medium', benchmark: { human_eval: 95, mmlu: 91, gpqa: 85 } },
  'cx/gpt-5.6-terra':          { cost_in: 1.25, cost_out: 10, latency: 'medium', benchmark: { human_eval: 94, mmlu: 90, gpqa: 84 } },
  'cx/gpt-5.6-luna':           { cost_in: 0.8,  cost_out: 5,  latency: 'low',   benchmark: { human_eval: 91, mmlu: 87, gpqa: 79 } },
  'cx/gpt-5.5':                { cost_in: 1.25, cost_out: 10, latency: 'medium', benchmark: { human_eval: 94, mmlu: 90, gpqa: 84 } },
  'cx/gpt-5.4':                { cost_in: 1.25, cost_out: 10, latency: 'medium', benchmark: { human_eval: 93, mmlu: 89, gpqa: 83 } },
  'cx/gpt-5.4-mini':           { cost_in: 0.4,  cost_out: 1.6, latency: 'low',   benchmark: { human_eval: 88, mmlu: 84, gpqa: 74 } },
  'cx/gpt-5.3-codex-spark':    { cost_in: 0.4,  cost_out: 1.6, latency: 'low',   benchmark: { human_eval: 90, mmlu: 85, gpqa: 75 } },
  'cx/codex-auto-review':      { cost_in: 1.25, cost_out: 10, latency: 'medium', benchmark: { human_eval: 95, mmlu: 91, gpqa: 86 } },

  // ---- MiniMax ----
  'minimax/MiniMax-M3':        { cost_in: 0.3,  cost_out: 1.2, latency: 'low',   benchmark: { human_eval: 93, mmlu: 89, gpqa: 81 } },
  'minimax/MiniMax-M2.7':      { cost_in: 0.3,  cost_out: 1.2, latency: 'low',   benchmark: { human_eval: 90, mmlu: 86, gpqa: 78 } },

  // ---- DeepSeek ----
  'ocg/deepseek-v4-pro':       { cost_in: 0.28, cost_out: 0.42, latency: 'medium', benchmark: { human_eval: 92, mmlu: 88, gpqa: 80 } },
  'ocg/deepseek-v4-flash':     { cost_in: 0.07, cost_out: 0.15, latency: 'low',   benchmark: { human_eval: 87, mmlu: 83, gpqa: 72 } },
  'ocg/deepseek-v4.1-flash':   { cost_in: 0.07, cost_out: 0.15, latency: 'low',   benchmark: { human_eval: 88, mmlu: 84, gpqa: 73 } },
  'ocg/deepseek-flash':        { cost_in: 0.07, cost_out: 0.15, latency: 'low',   benchmark: { human_eval: 85, mmlu: 81, gpqa: 70 } },

  // ---- GLM (Zhipu) ----
  'ocg/glm-5.3':               { cost_in: 0.3,  cost_out: 0.3,  latency: 'medium', benchmark: { human_eval: 91, mmlu: 87, gpqa: 79 } },
  'ocg/glm-5.2':               { cost_in: 0.3,  cost_out: 0.3,  latency: 'medium', benchmark: { human_eval: 90, mmlu: 86, gpqa: 78 } },
  'ocg/glm-5.1':               { cost_in: 0.3,  cost_out: 0.3,  latency: 'medium', benchmark: { human_eval: 89, mmlu: 85, gpqa: 77 } },
  'ocg/glm-5.3-flash':         { cost_in: 0.1,  cost_out: 0.1,  latency: 'low',   benchmark: { human_eval: 86, mmlu: 82, gpqa: 72 } },

  // ---- Kimi (Moonshot) ----
  'ocg/kimi-k2.7-code':        { cost_in: 0.6,  cost_out: 2.5,  latency: 'medium', benchmark: { human_eval: 92, mmlu: 87, gpqa: 79 } },
  'ocg/kimi-k2.6':             { cost_in: 0.6,  cost_out: 2.5,  latency: 'medium', benchmark: { human_eval: 90, mmlu: 86, gpqa: 77 } },
  'ocg/kimi-k2.5':             { cost_in: 0.6,  cost_out: 2.5,  latency: 'medium', benchmark: { human_eval: 89, mmlu: 85, gpqa: 76 } },
  'ocg/kimi-k3':               { cost_in: 0.6,  cost_out: 2.5,  latency: 'medium', benchmark: { human_eval: 91, mmlu: 87, gpqa: 78 } },

  // ---- StepFun & outros ----
  'ocg/step-5-preview-free':   { cost_in: 0.05, cost_out: 0.1,  latency: 'low',   benchmark: { human_eval: 88, mmlu: 85, gpqa: 75 } },
};

// Normalize cost/benefit into a 0-10 value for a given task priority.
export function modelMeta(id) {
  const raw = String(id || '');
  const [provider, rawModel] = raw.includes('/') ? raw.split('/') : ['', raw];
  const short = rawModel || raw;
  const baseShort = short.replace(/-(high|medium|low|thinking)$/, '').replace(/\[.*\]$/, '');

  const candidates = [
    raw,
    short,
    provider ? `${provider}/${baseShort}` : '',
    baseShort,
    `cc/${baseShort}`,
    `ag/${baseShort}`,
    `cx/${baseShort}`,
    `ocg/${baseShort}`,
    `minimax/${baseShort}`,
  ].filter(Boolean);

  let entry = null;
  for (const c of candidates) {
    if (MODEL_CATALOG[c]) {
      entry = MODEL_CATALOG[c];
      break;
    }
  }

  if (!entry) return null;
  const benchmarkAvg = (entry.benchmark.human_eval + entry.benchmark.mmlu + entry.benchmark.gpqa) / 3;
  const latencyScore = entry.latency === 'low' ? 9 : entry.latency === 'medium' ? 6 : 3;
  const costScore = Math.max(0, 10 - Math.log10(1 + entry.cost_in) * 3);
  return {
    costIn: entry.cost_in,
    costOut: entry.cost_out,
    latency: entry.latency,
    latencyScore,
    benchmarkAvg,
    benchmark: entry.benchmark,
    // composite: quality (benchmark) weighted most, then latency, then cost
    value: benchmarkAvg * 0.6 + latencyScore * 0.2 + costScore * 0.2
  };
}

export function describeModel(id) {
  const meta = modelMeta(id);
  if (!meta) return '';
  return `custo $${meta.costIn}/${meta.costOut} por M · latência ${meta.latency} · benchmarks HE${meta.benchmark.human_eval}/MMLU${meta.benchmark.mmlu}/GPQA${meta.benchmark.gpqa}`;
}