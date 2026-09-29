import fs from 'node:fs';
import path from 'node:path';

/**
 * Token and Latency Telemetry Recorder for JEV Decisions
 */
export function getTelemetryDir(projectDir = process.cwd()) {
  const dir = path.join(projectDir, '.jev');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function recordTelemetry(entry, projectDir = process.cwd()) {
  try {
    const dir = getTelemetryDir(projectDir);
    const filePath = path.join(dir, 'telemetry.jsonl');

    const fullEntry = {
      timestamp: new Date().toISOString(),
      feature: entry.feature || 'general',
      provider: entry.provider || 'unknown',
      jev_latency_ms: entry.jev_latency_ms || 120,
      jev_cost_usd: entry.jev_cost_usd || 0.000008,
      estimated_llm_latency_ms: entry.estimated_llm_latency_ms || 3000,
      estimated_llm_tokens_saved: entry.estimated_llm_tokens_saved || 15000,
      estimated_llm_cost_saved_usd: entry.estimated_llm_cost_saved_usd || 0.045,
      status: entry.status || 'success'
    };

    fs.appendFileSync(filePath, JSON.stringify(fullEntry) + '\n', 'utf-8');
    return fullEntry;
  } catch (err) {
    // Fail-open: never throw in telemetry
    return null;
  }
}

export function readTelemetrySummary(projectDir = process.cwd()) {
  const filePath = path.join(projectDir, '.jev', 'telemetry.jsonl');
  if (!fs.existsSync(filePath)) {
    return {
      total_decisions: 0,
      avg_jev_latency_ms: 0,
      total_time_saved_sec: 0,
      total_tokens_saved: 0,
      total_cost_saved_usd: 0
    };
  }

  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
  let totalLatency = 0;
  let totalTimeSavedMs = 0;
  let totalTokensSaved = 0;
  let totalCostSaved = 0;
  let count = 0;

  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      count += 1;
      totalLatency += row.jev_latency_ms || 0;
      totalTimeSavedMs += Math.max(0, (row.estimated_llm_latency_ms || 3000) - (row.jev_latency_ms || 0));
      totalTokensSaved += row.estimated_llm_tokens_saved || 0;
      totalCostSaved += row.estimated_llm_cost_saved_usd || 0;
    } catch {
      // skip corrupted line
    }
  }

  return {
    total_decisions: count,
    avg_jev_latency_ms: count > 0 ? Math.round(totalLatency / count) : 0,
    total_time_saved_sec: Math.round(totalTimeSavedMs / 1000),
    total_tokens_saved: totalTokensSaved,
    total_cost_saved_usd: Number(totalCostSaved.toFixed(4))
  };
}
