#!/usr/bin/env node
/**
 * JEV Smart File Explorer (Skill - Caso 4)
 * Finds candidate files using fast glob/grep, asks JEV to score them
 * in batches of 20, and returns only the top 2-3 highest scoring files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { JevClient } from '../../src/client.js';
import { QUESTION_TYPES } from '../../src/types.js';

export function collectCandidateFiles(rootDir = process.cwd(), max = 40) {
  const ignore = new Set(['node_modules', '.git', '.jev', 'dist', 'build', '.specs']);
  const files = [];

  function walk(current) {
    if (files.length >= max) return;
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith('.') && e.name !== '.env') continue;
        if (ignore.has(e.name)) continue;

        const full = path.join(current, e.name);
        if (e.isDirectory()) {
          walk(full);
        } else if (e.isFile()) {
          files.push(path.relative(rootDir, full));
          if (files.length >= max) return;
        }
      }
    } catch {
      // directory skip
    }
  }

  walk(rootDir);
  return files;
}

export async function rankFiles(query, files, projectDir = process.cwd()) {
  if (files.length === 0) return [];
  if (files.length <= 3) return files.map(f => ({ file: f, score: 8.0 }));

  const client = new JevClient();
  const batchSize = 20;
  const scoredFiles = [];

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const questions = {};

    batch.forEach((f, idx) => {
      questions[`file_${idx}`] = {
        type: QUESTION_TYPES.SCORE,
        instructions: `Avalie de 1 a 10 a relevância do arquivo '${f}' para a busca: "${query}".`,
        min: 1,
        max: 10
      };
    });

    const result = await client.evaluate(
      `Objetivo de busca: "${query}"\nArquivos candidatos: ${batch.join(', ')}`,
      questions,
      {
        feature: 'file-explorer',
        tokensSpared: 15000,
        llmLatency: 4000,
        projectDir
      }
    );

    batch.forEach((f, idx) => {
      const score = result?.answers?.[`file_${idx}`]?.score || 5.0;
      scoredFiles.push({ file: f, score });
    });
  }

  // Sort descending by score
  scoredFiles.sort((a, b) => b.score - a.score);
  return scoredFiles.slice(0, 3);
}

async function main() {
  const query = process.argv.slice(2).join(' ').trim();
  if (!query) {
    console.log('Uso: jev-explore "<pergunta ou conceito que busca>"');
    process.exit(1);
  }

  console.log(`🔍 [JEV EXPLORER]: Buscando candidatos para: "${query}"...`);
  const candidates = collectCandidateFiles(process.cwd(), 40);
  console.log(`📦 Avaliando ${candidates.length} arquivos com JEV System One em lotes de 20...`);

  const top = await rankFiles(query, candidates, process.cwd());

  console.log('\n🎯 [RESULTADO JEV]: Abra apenas os arquivos mais relevantes:');
  top.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.file} (Nota: ${item.score.toFixed(1)}/10)`);
  });
  console.log('\n💡 Claude Code: Leia apenas estes arquivos acima para responder ao usuário.\n');
}

if (process.argv[1] && process.argv[1].endsWith('explore.js')) {
  main().catch(err => {
    console.error('Erro no explorador:', err.message);
    process.exit(0);
  });
}
