#!/usr/bin/env node
/**
 * CLI para o JEV Visual Plan & Execution Flow Tracker (Archify + Cloudflare).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  parsePlanSteps,
  buildArchifyWorkflowCandidate,
  renderVisualPlan,
  startVisualPlanServer,
  stopVisualPlanServer,
  checkCloudflared,
  updatePlanStep
} from '../../src/visual-plan.js';
import { loadConfig } from '../../src/jev-config.js';

function printHelp() {
  console.log(`
📊 JEV Visual Plan — Acompanhamento Visual de Execução com Archify & Cloudflare

USO:
  node visual-plan.js create "<Título>" [tarefas.md] [--no-share]
      Cria o diagrama visual do plano (.archify/visual-plan-<slug>/) e gera link Cloudflare com senha.
      Extrai etapas, o que foi feito, itens em execução e próximos passos.

  node visual-plan.js update <candidate.json|plan.html> --step <id> --status <status> [opções]
      Atualiza o status de uma etapa e recompila o diagrama interativo com detalhes ricos.
      Status: planned | in_progress | testing | done

      OPÇÕES DE DETALHES:
        --details "<texto>"    Registra o detalhamento da etapa (o que foi feito, em andamento ou próximo)
        --done "<texto>"       Especifica o que foi entregue/concluído nesta etapa
        --next "<texto>"       Especifica os próximos passos/entregas mapeadas
        --subitem "<texto>"    Adiciona uma sub-tarefa/bullet point à etapa

  node visual-plan.js share <plan.html> [porta]
      Sobe o servidor local protegido por senha e o túnel público gratuito da Cloudflare.

  node visual-plan.js stop <plan.html>
      Encerra o servidor e o túnel Cloudflare do plano.

  node visual-plan.js status
      Verifica a disponibilidade do cloudflared e túneis ativos.

EXEMPLO DE CICLO COM DETALHES DAS ETAPAS:
  1. No planejamento:
     node visual-plan.js create "Feature Checkout Transparente" tasks.md

  2. Ao iniciar o backend:
     node visual-plan.js update .archify/visual-plan-checkout/candidate.json \\
       --step step_2 --status in_progress --details "Construindo rota /api/v1/charge e validação PIX"

  3. Ao testar:
     node visual-plan.js update .archify/visual-plan-checkout/candidate.json \\
       --step step_2 --status testing --details "Validando webhooks do gateway e concorrência"

  4. Ao concluir (registrando o que foi feito e próximos passos):
     node visual-plan.js update .archify/visual-plan-checkout/candidate.json \\
       --step step_2 --status done --done "Endpoints PIX e Cartão finalizados, 100% testes aprovados" \\
       --next "Iniciar integração do front-end com SDK de pagamento"
`);
}

async function handleCreate(title, tasksFile, args) {
  if (!title) {
    console.error('❌ Informe o título do plano: node visual-plan.js create "<Título>" [tarefas.md]');
    process.exit(1);
  }

  const noShare = args.includes('--no-share');
  const cfg = loadConfig();
  const autoShare = !noShare && (cfg.skills?.['jev-visual-plan']?.auto_share !== false);

  let rawContent = '';
  if (tasksFile && fs.existsSync(tasksFile)) {
    rawContent = fs.readFileSync(tasksFile, 'utf-8');
  } else if (tasksFile) {
    rawContent = tasksFile;
  }

  const steps = parsePlanSteps(rawContent);

  const slug = title.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'plan';

  const dateStr = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').split('.')[0];
  const outDir = path.join(process.cwd(), '.archify', `visual-plan-${slug}-${dateStr}`);
  fs.mkdirSync(outDir, { recursive: true });

  const htmlFile = 'plan.html';
  const htmlPath = path.join(outDir, htmlFile);
  const candidateFile = path.join(outDir, 'candidate.json');

  const candidateData = buildArchifyWorkflowCandidate(title, steps, htmlFile);
  fs.writeFileSync(candidateFile, JSON.stringify(candidateData, null, 2), 'utf-8');
  fs.writeFileSync(path.join(outDir, 'steps.json'), JSON.stringify(steps, null, 2), 'utf-8');

  console.log(`\n📋 Criando Fluxo Visual com Archify...`);
  console.log(`   Título:    ${title}`);
  console.log(`   Etapas:    ${candidateData.nodes.length}`);
  console.log(`   Diretório: ${outDir}`);

  const renderRes = renderVisualPlan(candidateFile, htmlPath);
  if (!renderRes.success) {
    console.error(`⚠️ Erro ao compilar com Archify: ${renderRes.error}`);
    process.exit(1);
  }

  console.log(`✅ Diagrama interativo compilado: ${htmlPath}`);

  if (autoShare) {
    console.log(`\n🚀 Iniciando compartilhamento seguro via Cloudflare Quick Tunnel...`);
    try {
      const share = startVisualPlanServer(htmlPath);
      console.log(`\n======================================================`);
      console.log(`🌐 LINK PÚBLICO TEMPORÁRIO (Cloudflare):`);
      console.log(`   ${share.url}`);
      console.log(`🔑 SENHA DE ACESSO:`);
      console.log(`   ${share.password}`);
      console.log(`💻 ACESSO LOCAL:`);
      console.log(`   ${share.localUrl}`);
      console.log(`======================================================\n`);
      if (!share.cloudflare) {
        console.log(`💡 Nota: cloudflared não detectado. O plano está disponível no link local.`);
        console.log(`   Para gerar link público externo sem login, instale: brew install cloudflared`);
      }
    } catch (e) {
      console.error(`⚠️ Falha ao iniciar túnel: ${e.message}`);
    }
  } else {
    console.log(`ℹ️ Compartilhamento desmarcado. Para compartilhar: node visual-plan.js share "${htmlPath}"`);
  }
}

async function handleUpdate(target, stepId, newStatus, options = {}) {
  if (!target || !stepId || !newStatus) {
    console.error('❌ Uso: node visual-plan.js update <candidate.json|plan.html> --step <id> --status <planned|in_progress|testing|done> [--details "..."]');
    process.exit(1);
  }

  const validStatuses = ['planned', 'in_progress', 'testing', 'done'];
  if (!validStatuses.includes(newStatus)) {
    console.error(`❌ Status inválido: ${newStatus}. Opções válidas: ${validStatuses.join(', ')}`);
    process.exit(1);
  }

  try {
    const res = updatePlanStep(target, stepId, newStatus, options);
    const statusLabels = {
      planned: '⏳ Planejado / Pendente',
      in_progress: '⚡ Em Execução',
      testing: '🧪 Em Teste',
      done: '✅ Concluído'
    };

    console.log(`\n✅ Fluxo visual atualizado com sucesso!`);
    console.log(`   Etapa:      ${res.step.id} (${res.step.title}) -> ${statusLabels[newStatus]}`);
    const details = res.step.doneDetails || res.step.inProgressDetails || res.step.nextSteps || res.step.description;
    if (details) {
      console.log(`   Detalhes:   ${details}`);
    }
    console.log(`   Arquivo:    ${res.htmlPath}`);
  } catch (err) {
    console.error(`❌ Erro ao atualizar etapa: ${err.message}`);
    process.exit(1);
  }
}

async function handleShare(htmlPath, port) {
  if (!htmlPath || !fs.existsSync(htmlPath)) {
    console.error('❌ Informe o caminho do arquivo plan.html existente.');
    process.exit(1);
  }

  const share = startVisualPlanServer(htmlPath, { port: port ? Number(port) : undefined });
  console.log(`\n======================================================`);
  console.log(`🌐 LINK PÚBLICO TEMPORÁRIO (Cloudflare):`);
  console.log(`   ${share.url}`);
  console.log(`🔑 SENHA DE ACESSO:`);
  console.log(`   ${share.password}`);
  console.log(`💻 ACESSO LOCAL:`);
  console.log(`   ${share.localUrl}`);
  console.log(`======================================================\n`);
}

async function handleStop(htmlPath) {
  if (!htmlPath) {
    console.error('❌ Informe o caminho do arquivo plan.html a encerrar.');
    process.exit(1);
  }
  const stopped = stopVisualPlanServer(htmlPath);
  if (stopped) {
    console.log('✅ Servidor e túnel encerrados com sucesso.');
  } else {
    console.log('ℹ️ Nenhum servidor ativo encontrado para este arquivo.');
  }
}

async function handleStatus() {
  const cf = checkCloudflared();
  console.log(`\n🔍 Verificação de Dependências do JEV Visual Plan:`);
  if (cf.installed) {
    console.log(`   ✅ Cloudflare Quick Tunnel: Disponível (${cf.path})`);
    console.log(`   ℹ️  Versão: ${cf.version}`);
    console.log(`   ✨ Zero credenciais necessárias — pronto para gerar links públicos com senha.`);
  } else {
    console.log(`   ⚠️  Cloudflare Quick Tunnel: NÃO encontrado.`);
    console.log(`   💡 Para gerar links públicos temporários sem conta/login, instale:`);
    console.log(`      brew install cloudflared`);
    console.log(`   (Sem o cloudflared, os planos funcionam normalmente na porta local).`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case 'create':
      await handleCreate(args[1], args[2], args.slice(3));
      break;

    case 'update': {
      const target = args[1];
      const stepIdx = args.indexOf('--step');
      const statusIdx = args.indexOf('--status');
      const detailsIdx = args.indexOf('--details');
      const doneIdx = args.indexOf('--done');
      const nextIdx = args.indexOf('--next');
      const subitemIdx = args.indexOf('--subitem');

      const stepId = stepIdx !== -1 ? args[stepIdx + 1] : null;
      const status = statusIdx !== -1 ? args[statusIdx + 1] : null;
      const details = detailsIdx !== -1 ? args[detailsIdx + 1] : null;
      const doneDetails = doneIdx !== -1 ? args[doneIdx + 1] : null;
      const nextSteps = nextIdx !== -1 ? args[nextIdx + 1] : null;
      const subItem = subitemIdx !== -1 ? args[subitemIdx + 1] : null;

      await handleUpdate(target, stepId, status, { details, doneDetails, nextSteps, subItem });
      break;
    }

    case 'share':
      await handleShare(args[1], args[2]);
      break;

    case 'stop':
      await handleStop(args[1]);
      break;

    case 'status':
      await handleStatus();
      break;

    default:
      printHelp();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
