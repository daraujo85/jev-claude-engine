#!/usr/bin/env node
/**
 * JEV CLI Utility — Performance & Token Savings Analytics
 * Analogue to `rtk gain`, provides instant ROI telemetry.
 */

import fs from 'node:fs';
import path from 'node:path';
import { readTelemetrySummary } from '../src/telemetry.js';
import { JevClient } from '../src/client.js';
import { QUESTION_TYPES } from '../src/types.js';

const VERSION = '1.0.0';

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

function printHeader() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${BOLD}   ⚡ JEV Decision Engine (TypeSafe AI) — Token & Speed Analytics${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);
}

async function showGain(showHistory = false) {
  printHeader();
  const summary = readTelemetrySummary();

  console.log(`  ${BOLD}Total de Decisões Tomadas:${RESET}       ${GREEN}${summary.total_decisions}${RESET}`);
  console.log(`  ${BOLD}Latência Média do JEV:${RESET}           ${GREEN}${summary.avg_jev_latency_ms} ms${RESET} ${DIM}(vs ~3.200 ms LLM padrão)${RESET}`);
  console.log(`  ${BOLD}Tempo Total Poupado:${RESET}             ${GREEN}${summary.total_time_saved_sec} segundos${RESET}`);
  console.log(`  ${BOLD}Tokens de Contexto Poupados:${RESET}     ${GREEN}${summary.total_tokens_saved.toLocaleString()} tokens${RESET}`);
  console.log(`  ${BOLD}Economia Financeira Estimada:${RESET}    ${GREEN}$${summary.total_cost_saved_usd.toFixed(4)} USD${RESET}\n`);

  if (showHistory) {
    const filePath = path.join(process.cwd(), '.jev', 'telemetry.jsonl');
    if (fs.existsSync(filePath)) {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean).slice(-10);
      console.log(`${BOLD}Últimas 10 Decisões:${RESET}`);
      lines.forEach((l, idx) => {
        try {
          const row = JSON.parse(l);
          console.log(`  ${idx + 1}. [${row.feature}] ${row.jev_latency_ms}ms | +${row.estimated_llm_tokens_saved} tokens poupados | status: ${row.status}`);
        } catch {
          // ignore
        }
      });
      console.log('');
    }
  }

  console.log(`${DIM}Dica: Configure JEV hooks no Claude Code para roteamento e guardrails com zero overhead de contexto.${RESET}\n`);
}

async function testConnection() {
  printHeader();
  console.log('📡 Testando conexão com TypeSafe JEV System One...');
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
    console.log(`\n${GREEN}✅ SUCESSO! Conexão estabelecida com sucesso.${RESET}`);
    console.log(`   Provedor: ${BOLD}${client.config.provider}${RESET}`);
    console.log(`   Modelo:   ${result.model}`);
    console.log(`   Latência: ${BOLD}${elapsed} ms${RESET}\n`);
  } catch (err) {
    console.log(`\n❌ Falha na conexão: ${err.message}\n`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'gain';

  if (cmd === 'gain') {
    const showHistory = args.includes('--history');
    await showGain(showHistory);
  } else if (cmd === 'test') {
    await testConnection();
  } else if (cmd === '--version' || cmd === '-v') {
    console.log(`jev-claude-engine v${VERSION}`);
  } else {
    console.log('Comandos disponíveis:');
    console.log('  jev gain            Exibe estatísticas de tokens e velocidade');
    console.log('  jev gain --history  Exibe histórico das decisões');
    console.log('  jev test            Testa conexão com a API do JEV');
  }
}

main().catch(err => {
  console.error('Erro no CLI JEV:', err.message);
  process.exit(1);
});
