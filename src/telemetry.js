import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Token and Latency Telemetry Recorder for JEV Decisions
 */
/**
 * Detect which coding agent is running (by env markers) and the current
 * project directory — used to annotate telemetry with where a decision ran.
 */
export function detectOrigin(cwd = process.cwd()) {
  let agent = 'cli';
  const markers = [
    { agent: 'opencode', test: () => process.env.OPENCODE === '1' || !!process.env.OPENCODE_PID },
    { agent: 'claude-code', test: () => !!process.env.CLAUDE_CODE_SESSION_ID || !!process.env.CLAUDE_PROJECT_DIR || !!process.env.CLAUDE_CODE_ENTRYPOINT },
    { agent: 'codex', test: () => !!process.env.CODEX_HOME || !!process.env.CODEX_SESSION_ID },
    { agent: 'agy', test: () => !!process.env.ANTIGRAVITY_HOME || !!process.env.AGY_SESSION_ID || !!process.env.GEMINI_CLI_SESSION_ID }
  ];
  for (const m of markers) {
    try {
      if (m.test()) { agent = m.agent; break; }
    } catch { /* ignore */ }
  }
  const project = process.env.CLAUDE_PROJECT_DIR || cwd || '';
  return { agent, project };
}

/** basename of a project path, tolerant to trailing slashes and worktrees. */
export function projectName(p) {
  if (!p) return '';
  const s = String(p).replace(/\/+$/, '');
  const seg = s.split('/');
  // collapse nested .claude/worktrees/<name> to the leaf project name
  for (let i = seg.length - 1; i >= 0; i--) {
    const cur = seg[i];
    if (cur && cur !== 'worktrees' && cur !== '.claude' && !cur.startsWith('.')) {
      return cur;
    }
  }
  return seg[seg.length - 1] || s;
}

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

    const origin = detectOrigin(projectDir);
    const fullEntry = {
      timestamp: new Date().toISOString(),
      feature: entry.feature || 'general',
      provider: entry.provider || 'unknown',
      origin_agent: entry.origin_agent || origin.agent,
      origin_project: entry.origin_project || origin.project,
      jev_latency_ms: entry.jev_latency_ms || 120,
      jev_input_tokens: entry.jev_input_tokens || 0,
      jev_cost_usd: entry.jev_cost_usd || 0.000008,
      input_preview: entry.input_preview || '',
      answer_type: entry.answer_type || '',
      answer_result: entry.answer_result || '',
      estimated_llm_latency_ms: entry.estimated_llm_latency_ms || 3000,
      estimated_llm_tokens_saved: entry.estimated_llm_tokens_saved || 15000,
      estimated_llm_cost_saved_usd: entry.estimated_llm_cost_saved_usd || 0.045,
      status: entry.status || 'success'
    };

    fs.appendFileSync(filePath, JSON.stringify(fullEntry) + '\n', 'utf-8');

    // Also mirror to global ~/.jev/telemetry.jsonl
    try {
      const globalDir = path.join(os.homedir(), '.jev');
      if (!fs.existsSync(globalDir)) {
        fs.mkdirSync(globalDir, { recursive: true });
      }
      fs.appendFileSync(path.join(globalDir, 'telemetry.jsonl'), JSON.stringify(fullEntry) + '\n', 'utf-8');
    } catch {
      // ignore
    }

    return fullEntry;
  } catch (err) {
    // Fail-open: never throw in telemetry
    return null;
  }
}

export function readTelemetrySummary(projectDir = process.cwd()) {
  const candidateFiles = [
    path.join(projectDir, '.jev', 'telemetry.jsonl'),
    path.join(os.homedir(), '.jev', 'telemetry.jsonl')
  ];
  const files = Array.from(new Set(candidateFiles)).filter(f => fs.existsSync(f));

  if (files.length === 0) {
    return {
      total_decisions: 0,
      avg_jev_latency_ms: 0,
      total_time_saved_sec: 0,
      total_tokens_saved: 0,
      total_cost_saved_usd: 0,
      by_feature: {},
      recent_entries: []
    };
  }

  const seen = new Set();
  const entries = [];

  for (const file of files) {
    try {
      const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const row = JSON.parse(line);
          const key = `${row.timestamp || ''}_${row.feature || ''}_${row.jev_latency_ms || ''}`;
          if (!seen.has(key)) {
            seen.add(key);
            entries.push(row);
          }
        } catch {
          // skip corrupted line
        }
      }
    } catch {
      // ignore
    }
  }

  let totalLatency = 0;
  let totalTimeSavedMs = 0;
  let totalTokensSaved = 0;
  let totalCostSaved = 0;
  let totalJevCost = 0;
  let totalJevInputTokens = 0;
  const byFeature = {};
  const byProject = {};

  for (const row of entries) {
    const lat = row.jev_latency_ms || 0;
    const timeSaved = Math.max(0, (row.estimated_llm_latency_ms || 3000) - lat);
    const tokens = row.estimated_llm_tokens_saved || 0;
    const cost = row.estimated_llm_cost_saved_usd || 0;
    const feat = row.feature || 'other';
    const jevCost = row.jev_cost_usd || 0.000008;
    const jevInput = row.jev_input_tokens || 0;
    const proj = projectName(row.origin_project);

    totalLatency += lat;
    totalTimeSavedMs += timeSaved;
    totalTokensSaved += tokens;
    totalCostSaved += cost;
    totalJevCost += jevCost;
    totalJevInputTokens += jevInput;

    if (!byFeature[feat]) {
      byFeature[feat] = {
        count: 0,
        tokens_saved: 0,
        time_saved_ms: 0,
        total_latency: 0,
        cost_saved_usd: 0
      };
    }
    byFeature[feat].count += 1;
    byFeature[feat].tokens_saved += tokens;
    byFeature[feat].time_saved_ms += timeSaved;
    byFeature[feat].total_latency += lat;
    byFeature[feat].cost_saved_usd += cost;

    if (proj) {
      if (!byProject[proj]) {
        byProject[proj] = { count: 0, tokens_saved: 0, time_saved_ms: 0, total_latency: 0, cost_saved_usd: 0 };
      }
      byProject[proj].count += 1;
      byProject[proj].tokens_saved += tokens;
      byProject[proj].time_saved_ms += timeSaved;
      byProject[proj].total_latency += lat;
      byProject[proj].cost_saved_usd += cost;
    }
  }

  const count = entries.length;
  const byFeatureSummary = {};
  for (const [k, v] of Object.entries(byFeature)) {
    byFeatureSummary[k] = {
      count: v.count,
      tokens_saved: v.tokens_saved,
      time_saved_sec: Math.round(v.time_saved_ms / 1000),
      avg_latency_ms: v.count > 0 ? Math.round(v.total_latency / v.count) : 0,
      cost_saved_usd: Number(v.cost_saved_usd.toFixed(4))
    };
  }

  const byProjectSummary = {};
  for (const [k, v] of Object.entries(byProject)) {
    byProjectSummary[k] = {
      count: v.count,
      tokens_saved: v.tokens_saved,
      time_saved_sec: Math.round(v.time_saved_ms / 1000),
      avg_latency_ms: v.count > 0 ? Math.round(v.total_latency / v.count) : 0,
      cost_saved_usd: Number(v.cost_saved_usd.toFixed(4))
    };
  }

  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    total_decisions: count,
    avg_jev_latency_ms: count > 0 ? Math.round(totalLatency / count) : 0,
    total_time_saved_sec: Math.round(totalTimeSavedMs / 1000),
    total_tokens_saved: totalTokensSaved,
    total_cost_saved_usd: Number(totalCostSaved.toFixed(4)),
    total_jev_cost_usd: Number(totalJevCost.toFixed(6)),
    total_jev_input_tokens: totalJevInputTokens,
    by_feature: byFeatureSummary,
    by_project: byProjectSummary,
    recent_entries: entries.slice(0, 100)
  };
}

