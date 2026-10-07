#!/usr/bin/env node
/**
 * JEV CLI Utility — Performance & Token Savings Analytics
 * Analogue to `rtk gain`, provides instant ROI telemetry.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readTelemetrySummary } from '../src/telemetry.js';
import { startDashboardServer } from '../src/dashboard.js';
import { JevClient } from '../src/client.js';
import { QUESTION_TYPES } from '../src/types.js';
import { loadConfig } from '../src/jev-config.js';
import { currentLang, t } from '../src/i18n.js';

const VERSION = '1.0.0';
const LANG = currentLang(loadConfig());
const L = (k) => t(k, LANG);

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

function printHeader() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${BOLD}   ⚡ ${L('cliHeader')}${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);
}

async function showGain(showHistory = false) {
  printHeader();
  const summary = readTelemetrySummary();

  console.log(`  ${BOLD}${L('cliTotalDecisions')}${RESET}       ${GREEN}${summary.total_decisions}${RESET}`);
  console.log(`  ${BOLD}${L('cliAvgLatency')}${RESET}           ${GREEN}${summary.avg_jev_latency_ms} ms${RESET} ${DIM}${L('cliVsLLM')}${RESET}`);
  console.log(`  ${BOLD}${L('cliTimeSaved')}${RESET}             ${GREEN}${summary.total_time_saved_sec} s${RESET}`);
  console.log(`  ${BOLD}${L('cliTokensSaved')}${RESET}     ${GREEN}${summary.total_tokens_saved.toLocaleString()} tokens${RESET}`);
  console.log(`  ${BOLD}${L('cliCostSaved')}${RESET}    ${GREEN}$${summary.total_cost_saved_usd.toFixed(4)} USD${RESET}\n`);

  if (showHistory) {
    const filePath = path.join(process.cwd(), '.jev', 'telemetry.jsonl');
    if (fs.existsSync(filePath)) {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean).slice(-10);
      console.log(`${BOLD}${L('cliLastDecisions')}${RESET}`);
      lines.forEach((l, idx) => {
        try {
          const row = JSON.parse(l);
          console.log(`  ${idx + 1}. [${row.feature}] ${row.jev_latency_ms}ms | +${row.estimated_llm_tokens_saved} ${L('cliTokensSavedShort')} | ${L('cliStatus')}: ${row.status}`);
        } catch {
          // ignore
        }
      });
      console.log('');
    }
  }

  console.log(`${DIM}${L('cliTip')}${RESET}\n`);
}

async function testConnection() {
  printHeader();
  console.log(`📡 ${L('cliTesting')}`);
  const startTime = Date.now();
  try {
    const client = new JevClient();
    const result = await client.evaluate(
      'Diagnóstico de conectividade JEV',
      {
        online: {
          type: QUESTION_TYPES.NOUL,
          instructions: 'Is the engine operational?'
        }
      },
      { feature: 'cli-test' }
    );

    const elapsed = Date.now() - startTime;
    console.log(`\n${GREEN}✅ ${L('cliSuccess')}${RESET}`);
    console.log(`   ${L('cliProvider')} ${BOLD}${client.config.provider}${RESET}`);
    console.log(`   ${L('cliModel')}   ${result.model}`);
    console.log(`   ${L('cliLatency')} ${BOLD}${elapsed} ms${RESET}\n`);
  } catch (err) {
    console.log(`\n❌ ${L('cliConnFail')} ${err.message}\n`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'gain';

  if (cmd === 'gain') {
    const showHistory = args.includes('--history');
    await showGain(showHistory);
  } else if (cmd === 'dashboard' || cmd === 'ui') {
    const portArg = args.find(a => a.startsWith('--port='));
    const port = portArg ? parseInt(portArg.split('=')[1], 10) : 3838;
    const noOpen = args.includes('--no-open');
    startDashboardServer({ port, openBrowser: !noOpen, projectDir: process.cwd() });
  } else if (cmd === 'browser') {
    const goal = args.slice(1).join(' ').trim() || 'Acessar página inicial';
    const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../skills/jev-browser-test/run-harness.py');
    const res = spawnSync('python3', [scriptPath, goal], { stdio: 'inherit' });
    process.exit(res.status || 0);
  } else if (cmd === 'plan' || cmd === 'visual-plan') {
    const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../skills/jev-visual-plan/visual-plan.js');
    const res = spawnSync('node', [scriptPath, ...args.slice(1)], { stdio: 'inherit' });
    process.exit(res.status || 0);
  } else if (cmd === 'test') {
    await testConnection();
  } else if (cmd === '--version' || cmd === '-v') {
    console.log(`jev-claude-engine v${VERSION}`);
  } else {
    console.log(`${L('cliCommands')}`);
    console.log(`  jev gain            ${L('cliGain')}`);
    console.log(`  jev gain --history  ${L('cliGainHistory')}`);
    console.log(`  jev dashboard       ${L('cliDashboard')}`);
    console.log(`  jev plan            Fluxo visual do plano (Archify + Cloudflare)`);
    console.log(`  jev browser <meta>  ${L('cliBrowser')}`);
    console.log(`  jev test            ${L('cliTest')}`);
  }

}

main().catch(err => {
  console.error(`${L('cliErr')}`, err.message);
  process.exit(1);
});
