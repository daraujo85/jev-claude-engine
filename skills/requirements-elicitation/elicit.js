#!/usr/bin/env node
/**
 * JEV Requirements Elicitation.
 * Turns a raw requirement context (ticket, PRD, ADR, transcript) into the
 * formal validation base: verifiable obligations, acceptance scenarios
 * (BDD), ambiguities/gaps, and mermaid artifacts (sequence, ER, components,
 * ADR). Persists everything under ~/.jev/.
 *
 * The generated requirements.md is the --context for business-acceptance-review.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  extractObligations,
  buildScenarios,
  detectGaps,
  getChangedFiles,
  getDeliveryDiff
} from '../business-acceptance-review/acceptance.js';

const esc = s => String(s).replace(/\|/g, '\\|');

// Atores: usuários/sistemas comuns em requisitos.
const ACTOR_RE = /\b(usu[áa]rio|cliente|respons[áa]ve|promotora|admin|gestor|sistema|app|api|backend|banco|gateway|sub|master)/gi;

// Entidades: substantivos capitalizados em PT-BR (classes candidatas).
const ENTITY_RE = /\b([A-ZÀ-Ú][a-zà-ú]{2,})\b/g;

export function extractActors(context) {
  const seen = new Set();
  for (const m of String(context || '').matchAll(ACTOR_RE)) {
    const a = m[1].toLowerCase();
    if (a.length > 2) seen.add(a);
  }
  return [...seen];
}

export function extractEntities(context) {
  const seen = new Set();
  const stop = new Set(['Quando', 'Então', 'Dado', 'Requisito', 'O', 'A', 'Os', 'As', 'Que', 'De']);
  for (const m of String(context || '').matchAll(ENTITY_RE)) {
    if (!stop.has(m[1])) seen.add(m[1]);
  }
  return [...seen];
}

export function extractDecisions(context) {
  // Decisões: frases com "decisão", "optamos", "escolhemos", "usaremos", "vamos usar".
  const seen = new Set();
  const re = /\b(decis[ãa]o|optamos|escolhemos|usaremos|vamos usar|adotaremos|a decis[ãa]o é)\b[^.!?\n]*[.!?\n]/gi;
  for (const m of String(context || '').matchAll(re)) seen.add(m[0].trim());
  return [...seen];
}

export function renderSequenceMermaid(scenarios) {
  const L = ['sequenceDiagram'];
  const label = s => {
    let t = s.when.replace(/^Quando\s+/i, '');
    t = t.replace(/^Requisito:\s*/i, '');
    return t.slice(0, 70);
  };
  const actorOf = s => {
    const m = (s.when.match(/(usu[áa]rio|respons[áa]ve|promotora|sistema|app|admin|sub|master)/i) || [])[0];
    return m ? m.charAt(0).toUpperCase() + m.slice(1) : 'Sistema';
  };
  const id = a => a.replace(/\s+/g, '_');

  const actors = new Set(['Sistema']);
  scenarios.forEach(s => actors.add(actorOf(s)));
  [...actors].forEach(a => L.push(`  participant ${id(a)} as ${a}`));

  for (const s of scenarios) {
    const actor = actorOf(s);
    L.push(`  ${id(actor)}->>Sistema: ${esc(label(s))}`);
    L.push(`  Sistema-->>${id(actor)}: resultado (${s.type})`);
  }
  return L.join('\n');
}

export function renderErMermaid(entities) {
  if (!entities.length) return 'classDiagram\n  class Sistema {}';
  const L = ['classDiagram'];
  entities.slice(0, 10).forEach(e => L.push(`  class ${e} {}`));
  if (entities.length > 1) {
    L.push(`  ${entities[0]} "1" -- "*" ${entities[1]}`);
  }
  return L.join('\n');
}

export function renderComponentMermaid(actors) {
  if (!actors.length) return 'flowchart LR\n  App["App"] --> API["API"]';
  const L = ['flowchart LR'];
  actors.forEach(a => L.push(`  ${a.replace(/\s+/g, '_')}["${a}"]`));
  for (let i = 0; i < actors.length - 1; i++) {
    L.push(`  ${actors[i].replace(/\s+/g, '_')} --> ${actors[i + 1].replace(/\s+/g, '_')}`);
  }
  return L.join('\n');
}

export function renderAdr(name, decisions, rules) {
  const L = [];
  L.push(`# ADR — ${name || 'Decisão de Arquitetura'}`);
  L.push('');
  L.push('## Status');
  L.push('- Proposto');
  L.push('');
  L.push('## Contexto');
  L.push('- Qual problema/oportunidade motivou esta decisão?');
  L.push('');
  if (decisions.length) {
    L.push('## Decisões levantadas na análise');
    decisions.forEach((d, i) => L.push(`${i + 1}. ${d}`));
    L.push('');
  } else {
    L.push('_Nenhuma decisão explícita no contexto. (preencher após desenvolvimento)_');
    L.push('');
  }
  L.push('## Requisitos relacionados');
  rules.slice(0, 8).forEach(r => L.push(`- ${r.id}: ${esc(r.rule).slice(0, 70)}`));
  L.push('');
  L.push('## Decisão');
  L.push('- (preencher)');
  L.push('');
  L.push('## Consequências');
  L.push('- Positivas: (preencher)');
  L.push('- Negativas: (preencher)');
  L.push('');
  L.push('## Alternativas consideradas');
  L.push('- (preencher)');
  return L.join('\n');
}

function saveArtifacts(name, report, artifacts) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safe = (name || 'requisito').replace(/[^\w-]+/g, '_').slice(0, 40);
  const dir = path.join(os.homedir(), '.jev', 'artifacts', `${safe}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const reqDir = path.join(os.homedir(), '.jev', 'requirements');
  fs.mkdirSync(reqDir, { recursive: true });

  const reqFile = path.join(reqDir, `${safe}-${stamp}.md`);
  fs.writeFileSync(reqFile, report, 'utf-8');

  const files = { requirements: reqFile };
  for (const [k, v] of Object.entries(artifacts)) {
    const f = path.join(dir, k);
    fs.writeFileSync(f, v, 'utf-8');
    files[k] = f;
  }
  return files;
}

export function renderReport(context, rules, scenarios, gaps, decisions, actors, entities, name) {
  const L = [];
  L.push(`# 📋 REQUISITOS — ${name || 'Levantamento'}`);
  L.push('');
  L.push('## 1. Contexto original');
  L.push('```');
  L.push(String(context || '').slice(0, 2000));
  L.push('```');
  L.push('');
  L.push('## 2. Requisitos (obrigações verificáveis)');
  L.push('');
  L.push('| ID | Requisito | Tipo |');
  L.push('|----|-----------|------|');
  for (const r of rules) {
    const type = r.type === 'hypothesis' ? '🟡 hipótese/ambíguo' : '✅ explícito';
    L.push(`| ${r.id} | ${esc(r.rule).slice(0, 90)} | ${type} |`);
  }
  if (!rules.length) L.push('| — | _Nenhum requisito detectado._ | ❓ |');
  L.push('');
  L.push('## 3. Critérios de aceite / Cenários BDD');
  L.push('');
  for (const s of scenarios) {
    L.push(`**${s.id}** — ${s.type} (requisito ${s.requirement})`);
    L.push(`- ${s.given}`);
    L.push(`- ${s.when}`);
    L.push(`- ${s.then}`);
    L.push('');
  }
  if (!scenarios.length) L.push('_Nenhum cenário gerado._');
  L.push('');
  L.push('## 4. Ambiguidades e lacunas');
  L.push('');
  if (gaps.length) gaps.forEach(g => L.push(`- ⚠️ ${g}`));
  else L.push('_Nenhuma lacuna típica detectada._');
  L.push('- ❓ **Ambíguo no contexto?** Marcar como hipótese e perguntar ao PO — nunca assumir.');
  L.push('');
  L.push('## 5. Perguntas para o PO');
  L.push('');
  if (gaps.length) gaps.forEach(g => L.push(`- [ ] ${g}`));
  L.push('- [ ] Confirmar critérios de aceite (seção 3).');
  L.push('');
  L.push('## 6. Atores e entidades');
  L.push('');
  L.push(`**Atores:** ${actors.length ? actors.join(', ') : '_não detectados_'}`);
  L.push('');
  L.push(`**Entidades (classes candidatas):** ${entities.length ? entities.join(', ') : '_não detectadas_'}`);
  L.push('');
  L.push('## 7. Artefatos mermaid');
  L.push('');
  L.push('- `sequence.mmd` — fluxo por cenário');
  L.push('- `er.mmd` — classes/entidades');
  L.push('- `components.mmd` — atores/sistemas');
  L.push('- `adr.md` — decisão de arquitetura');
  L.push('');
  L.push('## 8. Rastreabilidade');
  L.push('');
  L.push('_Este documento é o --context do business-acceptance-review na validação final._');
  return L.join('\n');
}

async function main() {
  let context = '';
  let base = '';
  let name = '';

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--context' || args[i] === '-c') context = fs.readFileSync(args[i + 1], 'utf-8'), i++;
    else if (args[i] === '--base') base = args[i + 1], i++;
    else if (args[i] === '--name' || args[i] === '-n') name = args[i + 1], i++;
    else if (!context) context = args[i];
  }

  if (!context && !process.stdin.isTTY) {
    let buf = '';
    for await (const chunk of process.stdin) buf += chunk;
    context = buf;
  }

  if (!context.trim()) {
    console.error('Uso: node elicit.js "<contexto>" | --context arquivo.md | stdin');
    console.error('     opções: --name <nome> (nome do requisito/card), --base <ref>');
    process.exit(1);
  }

  const rules = extractObligations(context);
  const scenarios = buildScenarios(rules);
  const gaps = detectGaps(context);
  const actors = extractActors(context);
  const entities = extractEntities(context);
  const decisions = extractDecisions(context);
  const diff = getDeliveryDiff(base);
  const files = getChangedFiles();

  const report = renderReport(context, rules, scenarios, gaps, decisions, actors, entities, name);
  process.stdout.write(report);
  process.stdout.write('\n');

  const artifacts = {
    'sequence.mmd': renderSequenceMermaid(scenarios),
    'er.mmd': renderErMermaid(entities),
    'components.mmd': renderComponentMermaid(actors),
    'adr.md': renderAdr(name, decisions, rules)
  };

  try {
    const saved = saveArtifacts(name, report, artifacts);
    console.error('\nArtefatos salvos:');
    for (const [k, f] of Object.entries(saved)) {
      console.error(`  - ${k}: ${f}`);
    }
  } catch (err) {
    console.error(`Não foi possível salvar artefatos: ${err.message}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('elicit.js')) {
  main().catch(err => {
    console.error('Erro na elicitação:', err.message);
    process.exit(0);
  });
}