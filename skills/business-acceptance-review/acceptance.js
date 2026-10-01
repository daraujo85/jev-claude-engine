#!/usr/bin/env node
/**
 * JEV Business Acceptance Review.
 * Extracts verifiable obligations from a requirement's context (ticket,
 * PRD, ADR, WhatsApp/email), flags ambiguities, builds acceptance
 * scenarios (BDD), inspects the delivery (git diff), and emits a
 * traceability matrix: requirement -> criterion -> scenario -> evidence
 * -> status, separating behavior compliance from business-outcome metrics.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';

// Obligation markers (PT-BR + EN).
const RULE_RE =
  /\b(deve|precisa|tem que|é necessário|não pode|não deve|nunca|sempre|somente|apenas quando|independente|obrigatório|permitido|esperado|espera-se|should|must|required|not allowed|shall)\b|crit[ée]rio|aceite|acceptance|whitelist|blacklist|gr[áa]tis|isento|m[íi]nimo|m[áa]ximo|taxa|multa|desde que|se e somente se|expira|expirar|v[áa]lido|permiss|acesso|convite|bloqueia|bloqueado/i;

const ACTION_RE =
  /(us[uo]|cancela|cancelar|permite|permitir|exibe|exibir|notifica|notificar|envia|enviar|bloqueia|bloquear|libera|liberar|valida|validar|retorna|retornar|criar|editar|excluir|alterar|paga|pagar|cobra|cobrar|taxa|aplica|exige|aprov|rejeita|rejeitar|calcula|calcular|convida|aceita|recusa|visualiza|acessa)/i;

// Hipótese / linguagem vaga — requisito ambíguo, não obrigação clara.
const HYPOTHESIS_RE = /\b(talvez|provavelmente|idealmente|se possível|quando possível|pode ser que|considerar|eventualmente|sugerir|algo como|depende de)\b/i;

// Informação tipicamente necessária que costuma faltar nos requisitos.
const GAP_HINTS = [
  ['expiração', /\b(convite|link|token|prazo)\b/i, /\b(expir|v[áa]lido por|validade|prazo de)\b/i],
  ['permissões', /\b(acess[oa]|perfil|respons[áa]ve|visualiza|edita)/i, /\b(permiss|role|acesso de|somente leitura|níveis de acesso)\b/i],
  ['fronteira de valor', /\b(m[íi]nimo|m[áa]ximo|at[ée]|a partir de|limite)\b/i, /\b(igual a|exatamente|menor que|maior que|zero|negativo)\b/i],
  ['exceção/erro', /\b(bloqueia|cancelar|recusa|não pode|negad)\b/i, /\b(erro|mensagem|motivo|feedback|rejeitad)\b/i]
];

const BULLET_RE = /^\s*(?:[-*•]|\d+[.):])\s+(.{10,})/;

// Tabela de decisão: separa sentenças com múltiplas condições (se/quando/caso + senão).
const DECISION_TABLE_RE = /\b(se|quando|caso|no caso de|a menos que)\b/i;

export function splitSentences(context) {
  const chunks = [];
  for (const raw of String(context || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const bullet = line.match(BULLET_RE);
    if (bullet) {
      chunks.push(bullet[1]);
      continue;
    }
    const parts = line.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú"“«(])/);
    for (const p of parts) {
      const t = p.trim();
      if (t.length >= 12) chunks.push(t);
    }
  }
  return chunks;
}

export function extractObligations(context) {
  const rules = [];
  const seen = new Set();
  const clauses = splitSentences(context)
    .map(s => s.split(/(?<=;)\s+/).map(t => t.trim()).filter(Boolean))
    .flat();

  for (const text of clauses) {
    const matchesRule = RULE_RE.test(text) || ACTION_RE.test(text);
    if (!matchesRule || seen.has(text)) continue;
    seen.add(text);
    const explicit = !HYPOTHESIS_RE.test(text);
    rules.push({
      id: `R${rules.length + 1}`,
      rule: text,
      source: text,
      type: explicit ? 'explicit' : 'hypothesis'
    });
  }
  return rules;
}

// Regras exportadas com alias de compatibilidade.
export const extractRules = extractObligations;

// Lacunas de informação típicas — detecta assunto presente sem definição.
export function detectGaps(context) {
  const gaps = [];
  for (const [name, trigger, definer] of GAP_HINTS) {
    if (trigger.test(context) && !definer.test(context)) {
      gaps.push(`Assunto "${name}" aparece, mas sem definição no requisito. Registrar como lacuna; não inventar regra.`);
    }
  }
  return gaps;
}

// Cenários de aceitação em BDD a partir das obrigações.
// Principal (satisfaz) + fronteira/alternativa (condições no texto).
export function buildScenarios(rules) {
  const scen = [];
  for (const r of rules) {
    scen.push({ id: `C${r.id}`, requirement: r.id, type: 'principal',
      given: 'Dado o cenário combinado',
      when: `Quando ${r.rule.replace(/\.$/, '')}`,
      then: 'Então o comportamento deve ser observável e verificável' });
    if (DECISION_TABLE_RE.test(r.rule)) {
      scen.push({ id: `C${r.id}-alt`, requirement: r.id, type: 'alternativa/fronteira',
        given: 'Dado outra combinação de condições (perfil/estado/prazo)',
        when: `Quando a condição da regra ${r.id} muda`,
        then: 'Então o resultado deve seguir a regra (tabela de decisão)' });
    }
  }
  return scen;
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

const esc = s => String(s).replace(/\|/g, '\\|');

export function renderReport(context, rules, diff, files, scenarios = [], gaps = []) {
  const L = [];
  L.push('# 📋 REVISÃO DE ACEITAÇÃO DE NEGÓCIO');
  L.push('');
  L.push('> Fonte da verdade: o contexto original. A entrega só conta como aceita se cumprir');
  L.push('> cada obrigação extraída dele — com evidência, não interpretação de código.');
  L.push('');
  L.push('## 1. Contexto original');
  L.push('```');
  L.push(String(context || '').slice(0, 2000));
  L.push('```');
  L.push('');
  L.push('## 2. Obrigações verificáveis');
  L.push('');
  L.push('| ID | Obrigação | Tipo |');
  L.push('|----|-----------|------|');
  for (const r of rules) {
    const type = r.type === 'hypothesis' ? '🟡 hipótese/ambíguo' : '✅ explícita';
    L.push(`| ${r.id} | ${esc(r.rule).slice(0, 90)} | ${type} |`);
  }
  if (!rules.length) L.push('| — | _Nenhuma obrigação verificável detectada._ | ❓ |');
  L.push('');
  L.push('## 3. Ambiguidades e lacunas de informação');
  L.push('');
  if (gaps.length) gaps.forEach(g => L.push(`- ⚠️ ${g}`));
  else L.push('_Nenhuma lacuna típica detectada. Revisar manualmente._');
  L.push('- ❓ **Ambíguo no contexto?** Marcar como hipótese e perguntar ao solicitante — nunca assumir.');
  L.push('');
  L.push('## 4. Cenários de aceitação (BDD)');
  L.push('');
  for (const s of scenarios) {
    L.push(`**${s.id}** — ${s.type} (requisito ${s.requirement})`);
    L.push(`- ${s.given}`);
    L.push(`- ${s.when}`);
    L.push(`- ${s.then}`);
    L.push('');
  }
  if (!scenarios.length) L.push('_Nenhum cenário gerado (sem obrigações). Executar jornada completa manualmente._');
  L.push('');
  L.push('## 5. Entrega (diff a inspecionar)');
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
    L.push('_Diff vazio — nada implementado ainda. Todas as obrigações ficam não verificadas._');
  }
  L.push('');
  L.push('## 6. Matriz de rastreabilidade');
  L.push('');
  L.push('| Requisito | Critério de aceite | Cenário | Evidência (teste/resposta/estado) | Status |');
  L.push('|-----------|-------------------|---------|----------------------------------|--------|');
  for (const s of scenarios) {
    L.push(`| ${s.requirement} | ${esc(s.when).slice(0, 60)} | ${s.id} | — | ⬜ por verificar |`);
  }
  L.push('');
  L.push('## 7. Parecer — Comportamento entregue (verificável agora)');
  L.push('');
  L.push('**Resultado:** X/Y atendidos · Z parcial · W não atendido · V não verificável');
  L.push('- ✅ **Atendida** — evidência clara em código/teste/comportamento.');
  L.push('- 🟡 **Parcial** — cobre parte, há gap de comportamento.');
  L.push('- ❌ **Não atendida** — pedido e não entregue.');
  L.push('- ❓ **Não verificável** — falta evidência; nunca assumir.');
  L.push('- ❗ **Critério obrigatório falhou** → parecer NÃO é atendimento completo.');
  L.push('');
  L.push('**Gaps críticos:**');
  L.push('- ');
  L.push('');
  L.push('## 8. Parecer — Resultado de negócio (métricas pós-publicação)');
  L.push('');
  L.push('_Esta segunda pergunta SÓ pode ser respondida com uso real + métricas. Verificação automática ≠ homologação humana._');
  L.push('');
  L.push('| Objetivo | Indicador | Valor inicial | Meta | Janela de avaliação | Status |');
  L.push('|----------|-----------|---------------|------|---------------------|--------|');
  L.push('| — | — | — | — | — | ⏳ pendente (pós-publicação) |');
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
    console.error('Uso: node acceptance.js "<contexto do requisito>" | --context arquivo.md | stdin');
    console.error('     opções: --base <ref> (base do diff, default: HEAD~1)');
    process.exit(1);
  }

  const rules = extractObligations(context);
  const scenarios = buildScenarios(rules);
  const gaps = detectGaps(context);
  const diff = getDeliveryDiff(base);
  const files = getChangedFiles();

  process.stdout.write(renderReport(context, rules, diff, files, scenarios, gaps));
}

if (process.argv[1] && process.argv[1].endsWith('acceptance.js')) {
  main().catch(err => {
    console.error('Erro no business acceptance review:', err.message);
    process.exit(0);
  });
}