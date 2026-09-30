/**
 * JEV config store — shared ~/.jev/config.json read/written by hooks,
 * skills, and the dashboard. Lets the user toggle hooks/skills and tune
 * thresholds from the dashboard UI without editing code.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_CONFIG = {
  ui: {
    lang: 'en'
  },
  jev: {
    api_key: ''
  },
  router: {
    base_url: 'http://localhost:20128',
    api_key: '',
    model_profiler: true,
    combo_suggester: true,
    task_router: true,
    // Map each JEV task type to a 9Router combo (must be a live combo).
    // Used by the JEV subagent router hook to pick the subagent model.
    task_combos: {
      writing_code: 'claude-coder',
      refactoring: 'claude-coder',
      debugging: 'claude-coder',
      tests: 'claude-coder',
      planning_architecture: 'claude-tudao',
      data_analysis: 'claude-tudao',
      creative_writing: 'claude-tudao',
      transcription: 'claude-tudao',
      code_review: 'claude-tools',
      docs: 'claude-tools'
    }
  },
  pricing: {
    price_per_million_input: 0.04,
    initial_balance_usd: 5.0
  },
  hooks: {
    'jev-rule-guard': {
      enabled: true,
      confidence_threshold: 0.80,
      block_rule_violation: true,
      block_contract_break: true,
      block_logic_weakening: true
    },
    'jev-skill-picker': {
      enabled: true,
      confidence_threshold: 0.50,
      min_skills: 5
    },
    'jev-task-router': {
      enabled: true,
      confidence_threshold: 0.55
    },
    'jev-fast-compact': {
      enabled: true,
      usage_threshold: 25
    },
    'jev-test-verifier': {
      enabled: true,
      warn_on_missing_tests: true,
      control_file_pattern: '(auth|role|permission|policy|guard|rule|access|payment|billing|session)'
    }
  },
  skills: {
    'jev-discover': { enabled: true, top_files: 3 },
    'jev-explore': { enabled: true, batch_size: 20, top_files: 3 },
    'jev-review': { enabled: true, confidence_threshold: 0.50 },
    'jev-anti-regression': { enabled: true, confidence_threshold: 0.75, min_severity: 'medium' },
    'jev-plan-evaluator': { enabled: true, min_score: 2.5 },
    'jev-browser-test': { enabled: true, max_steps: 10 }
  }
};

export function configPath() {
  const dir = process.env.JEV_CONFIG_DIR || path.join(os.homedir(), '.jev');
  return path.join(dir, 'config.json');
}

export function deepMerge(base, override) {
  const out = { ...base };
  for (const [k, v] of Object.entries(override || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Load config, merged over defaults so missing keys keep sane values. */
export function loadConfig() {
  try {
    if (fs.existsSync(configPath())) {
      const raw = JSON.parse(fs.readFileSync(configPath(), 'utf-8'));
      return deepMerge(DEFAULT_CONFIG, raw);
    }
  } catch {
    // corrupt/missing -> defaults
  }
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

/** Persist a full config. Returns normalized config on success. */
export function saveConfig(cfg) {
  const merged = deepMerge(DEFAULT_CONFIG, cfg);
  const dir = path.dirname(configPath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  return merged;
}

/** Reset config back to defaults on disk. */
export function resetConfig() {
  return saveConfig(DEFAULT_CONFIG);
}

/** Convenience: enabled flag for a hook or skill. */
export function isEnabled(cfg, kind, name) {
  return !!(cfg?.[kind]?.[name]?.enabled);
}