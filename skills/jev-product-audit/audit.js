#!/usr/bin/env node
/**
 * JEV Product Audit — Business-rule compliance checker.
 * Extracts the requested business rules from a task's context (ticket,
 * PRD, ADR, WhatsApp/email thread) and cross-checks them against the
 * delivery (git diff, changed files). Emits a markdown report skeleton
 * that the agent fills in with evidence.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';

// Sentences that state a requirement in PT-BR (and some EN).
// Modals + action verbs + acceptance-style phrasing.
const RULE_RE =
  /\b(deve|precisa|tem que|é necessário|não pode|não deve|nunca|sempre|somente|apenas quando|independente|obrigatório|permitido|esperado|espera-se|should|must|required|not allowed|shall)\b|crit[ée]rio|aceite|acceptance|whitelist|blacklist|gr[áa]tis|isento|m[íi]nimo|m[áa]ximo|taxa|multa|desde que|se e somente se/i;

// Verbos de ação comuns em requisito — incluindo conjugações (cobra, taxa, aplica, exige).
const ACTION_RE =
  /(us[uo]|cancela|cancelar|permite|permitir|exibe|exibir|notifica|notificar|envia|enviar|bloqueia|bloquear|libera|liberar|valida|validar|retorna|retornar|criar|editar|excluir|alterar|paga|pagar|cobra|cobrar|taxa|aplica|exige|aprov|rejeita|rejeitar|calcula|calcular)/i;

const BULLET_RE = /^\s*(?:[-*•]|\d+[.):])\s+(.{10,})/;

// Quebra o contexto em sentenças (pontuação de fim) antes de testar cada uma.
function splitSentences(context) {
  const chunks = [];
  for (const raw of String(context || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const bullet = line.match(BULLET_RE);
    if (bullet) {
      chunks.push(bullet[1]);
      continue;
    }
    // Separa sentenças por . ! ? seguido de espaço/caixa-alta, preservando bullets já quebrados.
    const parts = line.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú"“«(])/);
    for (const p of parts) {
      const t = p.trim();
      if (t.length >= 12) chunks.push(t);
    }
  }
  return chunks;
}

export function extractRules(context) {
  const rules = [];
  const seen = new Set();

  for (const text of splitSentences(context)) {
    const matchesRule =
      RULE_RE.test(text) ||
      ACTION_RE.test(text);

    if (!matchesRule) continue;
    if (seen.has(text)) continue;
    seen.add(text);

    rules.push({
      id: `R${rules.length + 1}`,
      rule: text,
      source: text
    });
  }
  return rules;
}

export function getDeliveryDiff(base, cwd = process.cwd()) {
  try {
    if (base) return execSync(`git diff ${base}...HEAD`, { cwd, encoding: 'utf-8' });
    const cached = execSync('git diff --cached', { cwd, encoding: 'utf-8' }).trim();
    if (cached) return cached;
    const head = execSync('git diff HEAD~1 2>/dev/null || git diff', { cwd, encoding: 'utf-8' }).trim();
    return head || '';
  } catch {
    return '';
  }
}

export function getChangedFiles(cwd = process.cwd()) {
  try {
    return execSync('git diff --name-only HEAD~1 2>/dev/null || git status --porcelain', { cwd, encoding: 'utf-8' })
      .split('\n').map(s => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function renderReport(context, rules, diff, files) {
  const L = [];
  L.push('# 📋 RELATÓRIO DE AUDITORIA — REGRAS DE NEGÓCIO');
  L.push('');
  L.push('> Fonte da verdade: o contexto original abaixo. A entrega só conta como feita');
  L.push('> se cumprir cada regra extraída dele. Não confie na interpretação do dev — confie no pedido.');
  L.push('');
  L.push('## 1. Contexto original');
  L.push('');
  L.push('```');
  L.push(String(context || '').slice(0, 2000));
  L.push('```');
  L.push('');
  L.push('## 2. Entrega (diff a inspecionar)');
  L.push('');
  if (files.length) {
    L.push('**Arquivos alterados:**');
    files.slice(0, 20).forEach(f => L.push(`- \`${f}\``));
  } else {
    L.push('_Nenhum arquivo alterado detectado._');
  }
  L.push('');
  if (diff.trim()) {
    L.push('**Diff (primeiros 3000 chars):**');
    L.push('```diff');
    L.push(diff.trim().slice(0, 3000));
    L.push('```');
  } else {
    L.push('_Diff vazio — nada implementado ainda. Todas as regras ficam não verificadas._');
  }
  L.push('');
  L.push('## 3. Regras extraídas do contexto');
  L.push('');
  L.push('| ID | Regra de negócio | Fonte no contexto | Status | Evidência |');
  L.push('|----|------------------|-------------------|--------|-----------|');
  for (const r of rules) {
    const src = r.source.replace(/\|/g, '\\|').slice(0, 60);
    const rule = r.rule.replace(/\|/g, '\\|').slice(0, 90);
    L.push(`| ${r.id} | ${rule} | ${src} | ⬜ por verificar | — |`);
  }
  if (!rules.length) {
    L.push('| — | _Nenhuma regra de negócio detectada no contexto._ | — | ❓ | Verificar se o contexto contém um pedido. |');
  }
  L.push('');
  L.push('## 4. Resumo executivo');
  L.push('');
  L.push('_(o agente preenche após inspecionar a entrega)_');
  L.push('');
  L.push('**Resultado:** X/Y regras atendidas · Z parcial · W não atendida · V não verificável');
  L.push('');
  L.push('**Gaps críticos:**');
  L.push('- ');
  L.push('');
  L.push('**Perguntas para o solicitante (se ambíguo):**');
  L.push('- ');
  return L.join('\n');
}

async function main() {
  let context = '';
  let base = '';

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--context' || args[i] === '-c') context = fs.readFileSync(args[i + 1], 'utf-8'), i++;
    else if (args[i] === '--base') base = args[i + 1], i++;
    else if (!context) context = args[i];
  }

  if (!context && !process.stdin.isTTY) {
    let buf = '';
    for await (const chunk of process.stdin) buf += chunk;
    context = buf;
  }

  if (!context.trim()) {
    console.error('Uso: node audit.js "<contexto do pedido>" | --context arquivo.md | stdin');
    console.error('     opções: --base <ref> (base do diff, default: HEAD~1)');
    process.exit(1);
  }

  const rules = extractRules(context);
  const diff = getDeliveryDiff(base);
  const files = getChangedFiles();

  process.stdout.write(renderReport(context, rules, diff, files));
}

if (process.argv[1] && process.argv[1].endsWith('audit.js')) {
  main().catch(err => {
    console.error('Erro no product audit:', err.message);
    process.exit(0);
  });
}