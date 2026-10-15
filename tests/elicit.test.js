import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractActors,
  extractEntities,
  extractDecisions,
  renderSequenceMermaid,
  renderErMermaid,
  renderComponentMermaid,
  renderAdr,
  renderReport
} from '../skills/requirements-elicitation/elicit.js';

const CTX = `Requisito: permitir que dois responsáveis acompanhem o mesmo aluno por meio de um convite.
- O segundo responsável que aceita um convite válido passa a acessar o mesmo perfil do aluno
- Convite expirado é utilizado: o vínculo é recusado e o motivo aparece
- Usuário sem vínculo tenta acessar o aluno: o acesso é negado
Decisão: adotaremos convite com expiração de 7 dias.`;

test('extractActors: identifica atores do contexto', () => {
  const actors = extractActors(CTX);
  assert.ok(actors.includes('responsáve'));
  assert.ok(actors.includes('usuário'));
});

test('extractEntities: extrai classes candidatas', () => {
  const entities = extractEntities(CTX);
  assert.ok(entities.includes('Convite'));
});

test('extractDecisions: captura decisões explícitas', () => {
  const decisions = extractDecisions(CTX);
  assert.ok(decisions.some(d => d.includes('adotaremos')));
});

test('renderSequenceMermaid: gera diagrama válido com atores e ações', () => {
  const scenarios = [
    { id: 'CR1', requirement: 'R1', type: 'principal', given: 'Dado', when: 'Quando o segundo responsável aceita um convite válido', then: 'Então acessa' }
  ];
  const mmd = renderSequenceMermaid(scenarios);
  assert.ok(mmd.startsWith('sequenceDiagram'));
  assert.ok(mmd.includes('participant'));
  assert.ok(mmd.includes('->>Sistema'));
});

test('renderErMermaid: gera classDiagram com entidades', () => {
  const mmd = renderErMermaid(['Convite', 'Usuário']);
  assert.ok(mmd.startsWith('classDiagram'));
  assert.ok(mmd.includes('class Convite'));
});

test('renderComponentMermaid: gera flowchart com atores', () => {
  const mmd = renderComponentMermaid(['usuário', 'sistema']);
  assert.ok(mmd.startsWith('flowchart LR'));
  assert.ok(mmd.includes('usuário'));
});

test('renderAdr: gera template com decisões e requisitos', () => {
  const adr = renderAdr('Convite Responsável', ['adotaremos expiração de 7 dias'], [
    { id: 'R1', rule: 'dois responsáveis acompanham o mesmo aluno', source: 'ctx' }
  ]);
  assert.ok(adr.includes('ADR — Convite Responsável'));
  assert.ok(adr.includes('adotaremos expiração'));
  assert.ok(adr.includes('R1'));
});

test('renderReport: consolida requisitos, cenários e perguntas ao PO', () => {
  const rules = [{ id: 'R1', rule: 'deve permitir convite', source: 'ctx', type: 'explicit' }];
  const scenarios = [{ id: 'CR1', requirement: 'R1', type: 'principal', given: 'Dado', when: 'Quando aceita', then: 'Então acessa' }];
  const report = renderReport(CTX, rules, scenarios, ['expiração sem definição'], ['adotaremos 7 dias'], ['usuário'], ['Convite'], 'Estudajunto');
  assert.ok(report.includes('REQUISITOS — Estudajunto'));
  assert.ok(report.includes('Perguntas para o PO'));
  assert.ok(report.includes('R1'));
  assert.ok(report.includes('sequence.mmd'));
});