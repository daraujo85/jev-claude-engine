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
  assert.equal(candidate.cards.length, 4);
  assert.equal(candidate.cards[0].title, 'Progresso da Execução');
  assert.equal(candidate.cards[1].title, 'O Que Já Foi Feito');
  assert.equal(candidate.cards[2].title, 'Em Execução & Testes');
  assert.equal(candidate.cards[3].title, 'Próximos Passos');
});

test('T17: parsePlanSteps captures rich step details (what was done, in progress, next steps)', () => {
  const md = `
# Plano de Desenvolvimento
- [x] 1. Arquitetura e Modelagem
  - Feito: Schemas criados no PostgreSQL
  - Feito: Validação de entidades no JEV
- [/] 2. Endpoints Core
  - Em andamento: Rota de pagamento e webhooks
- [ ] 3. Testes e Validação
  - Próximos passos: Testes unitários e cobertura
- [ ] 4. Deploy em Produção
`;

  const steps = parsePlanSteps(md);
  assert.equal(steps.length, 4);

  // Step 1: Concluído com o que foi feito
  assert.equal(steps[0].status, 'done');
  assert.ok(steps[0].doneDetails.includes('Schemas criados'));
  assert.ok(steps[0].subItems.length >= 2);

  // Step 2: Em andamento
  assert.equal(steps[1].status, 'in_progress');
  assert.ok(steps[1].inProgressDetails.includes('Rota de pagamento'));

  // Step 3: Próximos passos
  assert.equal(steps[2].status, 'planned');
  assert.ok(steps[2].nextSteps.includes('Testes unitários'));

  const candidate = buildArchifyWorkflowCandidate('Feature Detalhada', steps, 'detalhes.html');
  assert.equal(candidate.cards.length, 4);

  // Card O Que Já Foi Feito deve conter o detalhe da etapa 1
  assert.ok(candidate.cards[1].items.some(i => i.includes('Arquitetura e Modelagem')));

  // Card Em Execução deve conter o detalhe da etapa 2
  assert.ok(candidate.cards[2].items.some(i => i.includes('Endpoints Core')));

  // Card Próximos Passos deve conter a etapa 3
  assert.ok(candidate.cards[3].items.some(i => i.includes('Testes e Validação')));
});

test('T17: updatePlanStep updates status, details and re-renders candidate', async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs');
  const { updatePlanStep } = await import('../src/visual-plan.js');

  const tmpDir = path.join(os.tmpdir(), `jev-plan-test-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const initialSteps = [
    { id: 'step_1', index: 1, title: 'Setup', description: 'Setup inicial', status: 'planned', subItems: [] },
    { id: 'step_2', index: 2, title: 'Backend', description: 'API', status: 'planned', subItems: [] }
  ];

  fs.writeFileSync(path.join(tmpDir, 'steps.json'), JSON.stringify(initialSteps, null, 2));
  fs.writeFileSync(path.join(tmpDir, 'candidate.json'), JSON.stringify({
    schema_version: 2,
    diagram_type: 'workflow',
    meta: { title: 'Test Plan', output: 'plan.html' },
    lanes: [], phases: [], mainPath: [], nodes: [], edges: [], cards: []
  }, null, 2));

  const updateRes = updatePlanStep(tmpDir, 'step_1', 'done', {
    details: 'Setup e migrations executadas com sucesso',
    subItem: 'Configurado docker-compose'
  });

  assert.equal(updateRes.success, true);
  assert.equal(updateRes.step.status, 'done');
  assert.equal(updateRes.step.doneDetails, 'Setup e migrations executadas com sucesso');
  assert.ok(updateRes.step.subItems.includes('Configurado docker-compose'));

  // Verifica que candidate.json foi atualizado com 4 cards e os novos detalhes
  const candidateOnDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, 'candidate.json'), 'utf-8'));
  assert.equal(candidateOnDisk.cards.length, 4);
  assert.ok(candidateOnDisk.cards[1].items.some(i => i.includes('Setup e migrations')));

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
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
