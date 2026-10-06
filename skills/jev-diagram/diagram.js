#!/usr/bin/env node
/**
 * JEV Diagram Helper — Archify wrapper & layout optimizer for JEV System One.
 *
 * Facilita a criação, scaffolding, validação e finalização de diagramas
 * interativos (architecture, workflow, sequence, dataflow, lifecycle) usando Archify.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawnSync } from 'node:child_process';

const ARCHIFY_BIN = resolveArchifyBin();

function resolveArchifyBin() {
  const localBin = path.join(os.homedir(), '.local', 'bin', 'archify');
  if (fs.existsSync(localBin)) return localBin;

  const agentsBin = path.join(os.homedir(), '.agents', 'skills', 'archify', 'bin', 'archify.mjs');
  if (fs.existsSync(agentsBin)) return agentsBin;

  try {
    const which = execSync('which archify', { encoding: 'utf-8' }).trim();
    if (which) return which;
  } catch {}

  return 'archify';
}

function printHelp() {
  console.log(`
📊 jev-diagram — Gerador de Diagramas Interativos (Archify + JEV)

USO:
  node diagram.js scaffold <type> [dir]       Cria scaffold inicial de candidate.json
  node diagram.js finalize <type> <json> [html] Valida e compila com gates de qualidade
  node diagram.js render <type> <json> [html]   Renderiza direto sem strict gates
  node diagram.js guide "<cenário ou texto>"    Sugere o tipo de diagrama ideal
  node diagram.js types                         Lista os 5 tipos suportados e exemplos

TIPOS:
  architecture  Componentes, serviços, cloud, segurança, banco de dados
  workflow      Jornadas, processos, steps de negócio, aprovações, wizard
  sequence      Fluxo de chamadas de API, requisições síncronas/assíncronas
  dataflow      Pipelines de dados, ETL/ELT, movimentação financeira/docs
  lifecycle     Máquinas de estado, transições de status, aprovação/rejeição
`);
}

function getScaffold(type, outputHtml) {
  const relHtml = outputHtml || 'diagram.html';
  switch (type) {
    case 'architecture':
      return {
        schema_version: 1,
        diagram_type: 'architecture',
        meta: {
          title: 'Arquitetura do Sistema',
          quality_profile: 'showcase',
          output: relHtml,
        },
        components: [
          { id: 'client_ui', type: 'frontend', label: 'Frontend UI', sublabel: 'Web Client', pos: [40, 100], size: [130, 60] },
          { id: 'core_api', type: 'backend', label: 'Core API', sublabel: 'Node / REST', pos: [285, 100], size: [130, 60] },
          { id: 'msg_queue', type: 'messagebus', label: 'Message Broker', sublabel: 'RabbitMQ / SQS', pos: [530, 100], size: [130, 60] },
          { id: 'worker', type: 'backend', label: 'Async Worker', sublabel: 'Background Job', pos: [775, 100], size: [130, 60] },
          { id: 'db_main', type: 'database', label: 'Database', sublabel: 'PostgreSQL', pos: [530, 260], size: [130, 60] },
        ],
        boundaries: [
          { kind: 'region', label: 'Cloud Environment', wraps: ['core_api', 'msg_queue', 'worker', 'db_main'] },
        ],
        connections: [
          { id: 'ui-to-api', from: 'client_ui', to: 'core_api', label: 'HTTPS REST', variant: 'emphasis' },
          { id: 'api-to-queue', from: 'core_api', to: 'msg_queue', label: 'enfileira evento', variant: 'emphasis' },
          { id: 'queue-to-worker', from: 'msg_queue', to: 'worker', label: 'consome job', variant: 'emphasis' },
          { id: 'api-to-db', from: 'core_api', to: 'db_main', label: 'leitura/escrita', fromSide: 'bottom', toSide: 'left' },
          { id: 'worker-to-db', from: 'worker', to: 'db_main', label: 'atualiza estado', fromSide: 'bottom', toSide: 'right' },
        ],
        cards: [
          { dot: 'cyan', title: 'Camada de Aplicação', items: ['Frontend consome endpoints REST autenticados'] },
          { dot: 'emerald', title: 'Processamento Assíncrono', items: ['Mensageria desacopla requisições de execução pesada'] },
        ],
      };

    case 'workflow':
      return {
        schema_version: 2,
        diagram_type: 'workflow',
        meta: {
          title: 'Fluxo Operacional',
          animation: 'trace',
          quality_profile: 'showcase',
          output: relHtml,
        },
        lanes: [
          { id: 'user_lane', label: 'Usuário & Interface' },
          { id: 'engine_lane', label: 'Motor de Processamento' },
          { id: 'policy_lane', label: 'Validação & Políticas', variant: 'exception' },
          { id: 'delivery_lane', label: 'Entrega & Resultado' },
        ],
        phases: [
          { id: 'phase_input', label: '1. Entrada', fromCol: 0, toCol: 1 },
          { id: 'phase_eval', label: '2. Regras & Análise', fromCol: 2, toCol: 3, variant: 'emphasis' },
          { id: 'phase_done', label: '3. Conclusão', fromCol: 4, toCol: 5, variant: 'dashed' },
        ],
        mainPath: ['step_user', 'step_input', 'step_eval', 'step_policy', 'step_exec', 'step_done'],
        nodes: [
          { id: 'step_user', lane: 'user_lane', col: 0, type: 'external', label: 'Usuário', sublabel: 'Inicia ação', width: 132 },
          { id: 'step_input', lane: 'user_lane', col: 1, type: 'frontend', label: 'Interface', sublabel: 'Formulário / Wizard', width: 132 },
          { id: 'step_eval', lane: 'engine_lane', col: 2, type: 'backend', label: 'Motor', sublabel: 'Avalia condições', width: 132 },
          { id: 'step_policy', lane: 'policy_lane', col: 3, type: 'security', label: 'Políticas', sublabel: 'Regras de negócio', width: 132 },
          { id: 'step_exec', lane: 'engine_lane', col: 4, type: 'backend', label: 'Execução', sublabel: 'Aplica ação', width: 132 },
          { id: 'step_done', lane: 'delivery_lane', col: 5, type: 'external', label: 'Resultado', sublabel: 'Sucesso / Notificação', width: 132 },
        ],
        edges: [
          { id: 'e1', from: 'step_user', to: 'step_input', label: 'solicita', variant: 'emphasis' },
          { id: 'e2', from: 'step_input', to: 'step_eval', label: 'envia payload', variant: 'default' },
          { id: 'e3', from: 'step_eval', to: 'step_policy', label: 'valida', variant: 'security' },
          { id: 'e4', from: 'step_policy', to: 'step_exec', label: 'aprovado', variant: 'emphasis' },
          { id: 'e5', from: 'step_exec', to: 'step_done', label: 'notifica', variant: 'emphasis' },
        ],
        cards: [
          { dot: 'cyan', title: 'Jornada', items: ['Execução linear com validação de políticas'] },
        ],
      };

    default:
      throw new Error(`Tipo "${type}" não tem scaffold pré-definido. Tipos suportados: architecture, workflow.`);
  }
}

function handleScaffold(type, targetDir) {
  if (!['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle'].includes(type)) {
    console.error(`❌ Tipo inválido: ${type}. Use architecture, workflow, sequence, dataflow ou lifecycle.`);
    process.exit(1);
  }

  const dateStr = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').split('.')[0];
  const outDir = targetDir || path.join(process.cwd(), '.archify', `${type}-diagram-${dateStr}`);
  fs.mkdirSync(outDir, { recursive: true });

  const htmlFileName = `${type}-diagram.html`;
  const candidatePath = path.join(outDir, 'candidate.json');
  let relativeHtml = path.relative(process.cwd(), path.join(outDir, htmlFileName));
  if (relativeHtml.startsWith('..') || path.isAbsolute(relativeHtml)) {
    relativeHtml = htmlFileName;
  }

  const scaffoldData = getScaffold(type, relativeHtml);
  fs.writeFileSync(candidatePath, JSON.stringify(scaffoldData, null, 2), 'utf-8');

  console.log(`✅ Scaffold criado com sucesso:`);
  console.log(`   Diretório: ${outDir}`);
  console.log(`   JSON:      ${candidatePath}`);
  console.log(`   HTML meta: ${relativeHtml}`);
  console.log(`\nPara finalizar após editar:`);
  console.log(`   node diagram.js finalize ${type} "${candidatePath}" "${path.join(outDir, htmlFileName)}"`);
}

function handleFinalize(type, candidatePath, outputHtml) {
  if (!fs.existsSync(candidatePath)) {
    console.error(`❌ Arquivo não encontrado: ${candidatePath}`);
    process.exit(1);
  }

  const outHtml = outputHtml || candidatePath.replace(/\.json$/, '.html');
  console.log(`🚀 Executando Archify Finalize (Showcase quality)...`);
  console.log(`   Tipo:   ${type}`);
  console.log(`   Entrada: ${candidatePath}`);
  console.log(`   Saída:   ${outHtml}`);

  const res = spawnSync('node', [ARCHIFY_BIN, 'finalize', type, candidatePath, outHtml, '--quality', 'showcase', '--json'], {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });

  let parsed = null;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    console.log(res.stdout);
    if (res.stderr) console.error(res.stderr);
  }

  if (parsed) {
    if (parsed.ok) {
      console.log(`\n🎉 DIAGRAMA COMPILADO COM SUCESSO!`);
      console.log(`   Status:       ${parsed.status.toUpperCase()}`);
      console.log(`   Gates:        ${JSON.stringify(parsed.gates)}`);
      console.log(`   Arquivo HTML: ${parsed.artifact?.path || outHtml}`);
      if (parsed.artifact?.bytes) {
        console.log(`   Tamanho:      ${(parsed.artifact.bytes / 1024).toFixed(1)} KB`);
      }
    } else {
      console.error(`\n⚠️  FALHA DE VALIDAÇÃO / LAYOUT (Stage: ${parsed.failedStage})`);
      if (parsed.diagnostics && parsed.diagnostics.length > 0) {
        parsed.diagnostics.forEach((d, i) => {
          console.error(`\n[Diagnóstico #${i + 1}] (${d.code})`);
          console.error(`  Mensagem: ${d.message}`);
          if (d.supportedFixes) {
            console.error(`  Dicas de correção:`);
            d.supportedFixes.forEach((f) => console.error(`    - ${f}`));
          }
        });
      }
      process.exit(1);
    }
  } else if (res.status !== 0) {
    process.exit(res.status || 1);
  }
}

function handleGuide(scenario) {
  const s = (scenario || '').toLowerCase();
  console.log(`\n🎯 Guia de Seleção de Tipo para: "${scenario || 'geral'}"\n`);
  if (s.includes('api') || s.includes('request') || s.includes('chamada') || s.includes('sequencia') || s.includes('http')) {
    console.log(`➡️  Recomendado: SEQUENCE`);
    console.log(`   Ideal para chains de API, chamadas síncronas/assíncronas e request lifecycles.`);
  } else if (s.includes('banco') || s.includes('microserviço') || s.includes('serviço') || s.includes('cloud') || s.includes('arquitetura') || s.includes('infra')) {
    console.log(`➡️  Recomendado: ARCHITECTURE`);
    console.log(`   Ideal para componentes, serviços, filas, bancos, boundaries de nuvem e segurança.`);
  } else if (s.includes('etapas') || s.includes('passos') || s.includes('jornada') || s.includes('processo') || s.includes('wizard') || s.includes('workflow')) {
    console.log(`➡️  Recomendado: WORKFLOW`);
    console.log(`   Ideal para jornadas do usuário, wizards multi-etapas, esteiras de aprovação e runbooks.`);
  } else if (s.includes('dados') || s.includes('pipeline') || s.includes('etl') || s.includes('fluxo') || s.includes('origem')) {
    console.log(`➡️  Recomendado: DATAFLOW`);
    console.log(`   Ideal para pipelines de dados, ETL/ELT, movimentação financeira e rastreio de documentos.`);
  } else if (s.includes('estado') || s.includes('status') || s.includes('transição') || s.includes('lifecycle')) {
    console.log(`➡️  Recomendado: LIFECYCLE`);
    console.log(`   Ideal para status de pedidos, máquinas de estado, aprovações e retentativas.`);
  } else {
    console.log(`➡️  Sugestão Geral:`);
    console.log(`   - Use 'architecture' para componentes técnicos e repositórios.`);
    console.log(`   - Use 'workflow' para regras de negócio e fluxos passo a passo.`);
  }
}

const [cmd, arg1, arg2, arg3] = process.argv.slice(2);

switch (cmd) {
  case 'scaffold':
    handleScaffold(arg1, arg2);
    break;
  case 'finalize':
    handleFinalize(arg1, arg2, arg3);
    break;
  case 'guide':
    handleGuide(arg1);
    break;
  case 'types':
    console.log(`
Tipos suportados:
  1. architecture: Componentes, boundaries, conexões entre serviços/bancos
  2. workflow: Raias (lanes), fases, nós com papéis de erro/retorno e trace motion
  3. sequence: Linhas do tempo de participantes e mensagens trocadas
  4. dataflow: Estágios de transformação e ingestão de dados
  5. lifecycle: Estados finitos e transições condicionais
`);
    break;
  default:
    printHelp();
}
