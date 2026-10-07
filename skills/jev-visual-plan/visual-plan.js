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
  checkCloudflared
} from '../../src/visual-plan.js';
import { loadConfig } from '../../src/jev-config.js';

function printHelp() {
  console.log(`
📊 JEV Visual Plan — Acompanhamento Visual de Execução com Archify & Cloudflare

USO:
  node visual-plan.js create "<Título>" [tarefas.md] [--no-share]
      Cria o diagrama visual do plano (.archify/visual-plan-<slug>/) e gera link Cloudflare com senha.

  node visual-plan.js update <candidate.json|plan.html> --step <id> --status <status>
      Atualiza o status de uma etapa (planned | in_progress | testing | done) e recompila o diagrama.

  node visual-plan.js share <plan.html> [porta]
      Sobe o servidor local protegido por senha e o túnel público gratuito da Cloudflare.

  node visual-plan.js stop <plan.html>
      Encerra o servidor e o túnel Cloudflare do plano.

  node visual-plan.js status
      Verifica a disponibilidade do cloudflared e túneis ativos.

EXEMPLO DE USO NO FLUXO DE DESENVOLVIMENTO:
  1. No planejamento:
     node visual-plan.js create "Feature Autenticação JWT" tasks.md

  2. Ao iniciar uma etapa:
     node visual-plan.js update .archify/visual-plan-jwt/candidate.json --step step_2 --status in_progress

  3. Ao testar:
     node visual-plan.js update .archify/visual-plan-jwt/candidate.json --step step_2 --status testing

  4. Ao concluir:
     node visual-plan.js update .archify/visual-plan-jwt/candidate.json --step step_2 --status done
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

async function handleUpdate(target, stepId, newStatus) {
  if (!target || !stepId || !newStatus) {
    console.error('❌ Uso: node visual-plan.js update <candidate.json|plan.html> --step <id> --status <planned|in_progress|testing|done>');
    process.exit(1);
  }

  const validStatuses = ['planned', 'in_progress', 'testing', 'done'];
  if (!validStatuses.includes(newStatus)) {
    console.error(`❌ Status inválido: ${newStatus}. Opções válidas: ${validStatuses.join(', ')}`);
    process.exit(1);
  }

  let jsonPath = target;
  let htmlPath = target;
  if (target.endsWith('.html')) {
    jsonPath = path.join(path.dirname(target), 'candidate.json');
  } else {
    htmlPath = path.join(path.dirname(target), 'plan.html');
  }

  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ Arquivo de especificação não encontrado: ${jsonPath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  let found = false;

  const statusLanes = {
    planned: 'lane_planned',
    in_progress: 'lane_exec',
    testing: 'lane_test',
    done: 'lane_done'
  };

  const statusSublabels = {
    planned: '⏳ Pendente',
    in_progress: '⚡ Em Execução',
    testing: '🧪 Em Teste',
    done: '✅ Concluído'
  };

  const statusTypes = {
    planned: 'external',
    in_progress: 'backend',
    testing: 'security',
    done: 'frontend'
  };

  data.nodes = (data.nodes || []).map(n => {
    if (n.id === stepId || n.label === stepId) {
      found = true;
      return {
        ...n,
        lane: statusLanes[newStatus] || n.lane,
        sublabel: statusSublabels[newStatus] || n.sublabel,
        type: statusTypes[newStatus] || n.type
      };
    }
    return n;
  });

  if (!found) {
    console.error(`❌ Etapa com id ou título "${stepId}" não encontrada.`);
    process.exit(1);
  }

  // Recalcula cards
  const total = data.nodes.length;
  const doneCount = data.nodes.filter(n => n.lane === 'lane_done').length;
  const inProgCount = data.nodes.filter(n => n.lane === 'lane_exec').length;
  const testCount = data.nodes.filter(n => n.lane === 'lane_test').length;
  const plannedCount = data.nodes.filter(n => n.lane === 'lane_planned').length;
  const pct = Math.round((doneCount / total) * 100);

  data.cards = [
    {
      dot: pct === 100 ? 'emerald' : (pct >= 50 ? 'cyan' : 'amber'),
      title: 'Progresso da Execução',
      items: [
        `Progresso geral: ${pct}% (${doneCount}/${total} etapas concluídas)`,
        `⚡ Em Execução: ${inProgCount} | 🧪 Em Teste: ${testCount} | ⏳ Pendentes: ${plannedCount}`
      ]
    },
    {
      dot: 'cyan',
      title: 'Última Atualização',
      items: [
        `Etapa "${stepId}" atualizada para: ${statusSublabels[newStatus]}`,
        `Horário: ${new Date().toLocaleTimeString()}`
      ]
    }
  ];

  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`🔄 Recompilando fluxo visual atualizado...`);
  const renderRes = renderVisualPlan(jsonPath, htmlPath);

  if (renderRes.success) {
    console.log(`✅ Fluxo visual atualizado com sucesso!`);
    console.log(`   Etapa:   ${stepId} -> ${statusSublabels[newStatus]}`);
    console.log(`   Arquivo: ${htmlPath}`);
  } else {
    console.error(`⚠️ Erro na compilação: ${renderRes.error}`);
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
      const stepId = stepIdx !== -1 ? args[stepIdx + 1] : null;
      const status = statusIdx !== -1 ? args[statusIdx + 1] : null;
      await handleUpdate(target, stepId, status);
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
