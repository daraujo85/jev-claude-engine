import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkCloudflared,
  parsePlanSteps,
  buildArchifyWorkflowCandidate,
  resolveArchifyBin
} from '../src/visual-plan.js';
import { DEFAULT_CONFIG, loadConfig } from '../src/jev-config.js';

test('T17: checkCloudflared returns boolean installed and zero_credentials flag', () => {
  const cf = checkCloudflared();
  assert.equal(typeof cf.installed, 'boolean');
  assert.equal(cf.zero_credentials, true);
});

test('T17: parsePlanSteps parses markdown checklist with status markers', () => {
  const md = `
# Tarefas do Projeto
- [x] 1. Mapeamento de requisitos e arquitetura
- [/] 2. Implementação do backend e rotas
- [t] 3. Testes unitários e cobertura
- [ ] 4. Deploy em produção e entrega
`;

  const steps = parsePlanSteps(md);
  assert.equal(steps.length, 4);

  assert.equal(steps[0].status, 'done');
  assert.equal(steps[1].status, 'in_progress');
  assert.equal(steps[2].status, 'testing');
  assert.equal(steps[3].status, 'planned');
});

test('T17: parsePlanSteps parses numbered text with parenthetical status', () => {
  const text = `
1. Setup inicial (Done)
2. Banco de dados (In Progress)
3. Auditoria de segurança (Testing)
4. Documentação final
`;

  const steps = parsePlanSteps(text);
  assert.equal(steps.length, 4);
  assert.equal(steps[0].status, 'done');
  assert.equal(steps[1].status, 'in_progress');
  assert.equal(steps[2].status, 'testing');
  assert.equal(steps[3].status, 'planned');
});

test('T17: buildArchifyWorkflowCandidate generates complete Archify workflow schema', () => {
  const steps = [
    { id: 'step_1', index: 1, title: 'Requisitos', description: 'Mapeamento', status: 'done' },
    { id: 'step_2', index: 2, title: 'Código', description: 'Desenvolvimento', status: 'in_progress' },
    { id: 'step_3', index: 3, title: 'Testes', description: 'QA', status: 'testing' },
    { id: 'step_4', index: 4, title: 'Deploy', description: 'Produção', status: 'planned' }
  ];

  const candidate = buildArchifyWorkflowCandidate('Feature Teste', steps, 'output.html');

  assert.equal(candidate.schema_version, 2);
  assert.equal(candidate.diagram_type, 'workflow');
  assert.equal(candidate.meta.title, 'Feature Teste');
  assert.equal(candidate.meta.output, 'output.html');

  assert.equal(candidate.lanes.length, 4);
  assert.deepEqual(candidate.lanes.map(l => l.id), [
    'lane_planned', 'lane_exec', 'lane_test', 'lane_done'
  ]);

  assert.equal(candidate.nodes.length, 4);
  assert.equal(candidate.nodes[0].lane, 'lane_done');
  assert.equal(candidate.nodes[1].lane, 'lane_exec');
  assert.equal(candidate.nodes[2].lane, 'lane_test');
  assert.equal(candidate.nodes[3].lane, 'lane_planned');

  assert.equal(candidate.edges.length, 3);
  assert.equal(candidate.cards.length, 2);
});

test('T17: DEFAULT_CONFIG has jev-visual-plan enabled by default with auto_share', () => {
  const skillCfg = DEFAULT_CONFIG.skills?.['jev-visual-plan'];
  assert.ok(skillCfg, 'jev-visual-plan deve existir no DEFAULT_CONFIG.skills');
  assert.equal(skillCfg.enabled, true, 'deve vir selecionada por default');
  assert.equal(skillCfg.auto_share, true, 'auto_share deve ser true por default');
});

test('T17: resolveArchifyBin returns path or command for Archify', () => {
  const bin = resolveArchifyBin();
  assert.ok(bin && typeof bin === 'string' && bin.length > 0);
});
