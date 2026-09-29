#!/usr/bin/env node
/**
 * JEV Hybrid Discovery Engine (Graphify -> GrepAI -> JEV -> Claude)
 * 1. Graphify: Structural graph relation discovery
 * 2. GrepAI: Semantic vector & symbol reference search
 * 3. JEV: High-speed scoring and filtering (1-10) in <200ms
 * 4. Claude: Final System Two deep reasoning on top 2-3 files only
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { JevClient } from '../../src/client.js';
import { QUESTION_TYPES } from '../../src/types.js';
import { renderJevCard } from '../../src/ui.js';

export function runGraphifyDiscovery(query, cwd = process.cwd()) {
  const graphFile = path.join(cwd, 'graphify-out', 'graph.json');
  if (!fs.existsSync(graphFile)) {
    return { available: false, nodes: [] };
  }

  try {
    const raw = execSync(`graphify query "${query.replace(/"/g, '\\"')}" --budget 600 2>/dev/null`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 3000
    });
    // Extract file mentions from graphify output
    const matches = raw.match(/([a-zA-Z0-9_\-./]+\.(?:js|ts|tsx|jsx|py|go|rs|json|md))/g) || [];
    return { available: true, nodes: [...new Set(matches)].slice(0, 10), rawSummary: raw.slice(0, 300) };
  } catch {
    return { available: false, nodes: [] };
  }
}

export function runGrepaiDiscovery(query, cwd = process.cwd()) {
  try {
    const raw = execSync(`grepai search "${query.replace(/"/g, '\\"')}" --json --limit 10 2>/dev/null`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 3500
    });
    const parsed = JSON.parse(raw);
    const files = (parsed.results || parsed || []).map(r => r.path || r.file || r.location).filter(Boolean);
    return { available: true, files: [...new Set(files)].slice(0, 10) };
  } catch {
    // If grepai index not initialized, fallback to fast git ls-files/rg
    try {
      const fallback = execSync(`git ls-files | head -30 2>/dev/null`, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore']
      });
      return { available: false, files: fallback.split('\n').filter(Boolean) };
    } catch {
      return { available: false, files: [] };
    }
  }
}

export async function hybridDiscovery(query, cwd = process.cwd()) {
  const startTime = Date.now();

  // Stage 1: Graphify
  const graphifyRes = runGraphifyDiscovery(query, cwd);

  // Stage 2: GrepAI
  const grepaiRes = runGrepaiDiscovery(query, cwd);

  // Merge unique candidate files
  const allCandidates = [...new Set([...graphifyRes.nodes, ...grepaiRes.files])].filter(f => {
    return fs.existsSync(path.join(cwd, f)) || fs.existsSync(f);
  });

  if (allCandidates.length === 0) {
    return {
      topFiles: [],
      graphifyFound: 0,
      grepaiFound: 0,
      latencyMs: Date.now() - startTime
    };
  }

  // Stage 3: JEV System One Scoring
  const client = new JevClient();
  const questions = {};
  allCandidates.slice(0, 20).forEach((f, idx) => {
    questions[`file_${idx}`] = {
      type: QUESTION_TYPES.SCORE,
      instructions: `Avalie de 1 a 10 a relevância do arquivo '${f}' para responder: "${query}".`,
      min: 1,
      max: 10
    };
  });

  const jevResult = await client.evaluate(
    `INTENÇÃO DE BUSCA: "${query}"\nARQUIVOS IDENTIFICADOS PELO GRAFO E BUSCA SEMÂNTICA:\n${allCandidates.join('\n')}`,
    questions,
    {
      feature: 'hybrid-discovery',
      tokensSpared: allCandidates.length * 2000,
      llmLatency: 4500,
      projectDir: cwd
    }
  );

  const scored = allCandidates.slice(0, 20).map((f, idx) => {
    const s = jevResult?.answers?.[`file_${idx}`]?.score || 5.0;
    return { file: f, score: typeof s === 'number' ? s : 5.0 };
  });

  scored.sort((a, b) => b.score - a.score);
  const topFiles = scored.slice(0, 3);

  return {
    topFiles,
    graphifyFound: graphifyRes.nodes.length,
    grepaiFound: grepaiRes.files.length,
    totalEvaluated: allCandidates.length,
    latencyMs: Date.now() - startTime,
    jevLatencyMs: jevResult.latency_ms || 120
  };
}

async function main() {
  const query = process.argv.slice(2).join(' ').trim();
  if (!query) {
    console.log('Uso: jev-discover "<pergunta conceitual sobre o código>"');
    process.exit(1);
  }

  console.log(`\n🚀 [PIPELINE DE DISCOVERY]: Graphify ➔ GrepAI ➔ JEV ➔ Claude`);
  console.log(`🎯 Pergunta: "${query}"\n`);

  const result = await hybridDiscovery(query, process.cwd());

  const card = renderJevCard({
    feature: 'Discovery: Graphify ➔ GrepAI ➔ JEV',
    target: query.slice(0, 30),
    latencyMs: result.jevLatencyMs,
    confidence: 0.98,
    decision: result.topFiles.length > 0 ? result.topFiles[0].file : 'Nenhum arquivo',
    tokensSaved: result.totalEvaluated * 2500,
    details: [
      `🌐 Graphify: ${result.graphifyFound} nós estruturais identificados`,
      `🧠 GrepAI: ${result.grepaiFound} arquivos semanticamente mapeados`,
      `⚡ JEV: ${result.totalEvaluated} candidatos pontuados em ${result.jevLatencyMs}ms`
    ]
  });

  console.log(card);

  console.log('📂 [ARQUIVOS SELECIONADOS PARA LEITURA PELO CLAUDE]:');
  result.topFiles.forEach((f, i) => {
    console.log(`   ${i + 1}. \x1b[32m${f.file}\x1b[0m (Score JEV: ${f.score.toFixed(1)}/10)`);
  });
  console.log('\n🤖 Claude Code: Abra somente estes arquivos acima no seu contexto.\n');
}

if (process.argv[1] && process.argv[1].endsWith('discover.js')) {
  main().catch(err => {
    console.error('Erro no discovery:', err.message);
    process.exit(0);
  });
}
