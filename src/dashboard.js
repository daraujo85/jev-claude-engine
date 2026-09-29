import http from 'node:http';
import { exec } from 'node:child_process';
import { readTelemetrySummary } from './telemetry.js';

export function createDashboardHtml(initialData, projectDir) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JEV System One — Telemetry Dashboard</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(22, 27, 46, 0.7);
      --card-border: rgba(99, 102, 241, 0.2);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --primary: #6366f1;
      --primary-glow: rgba(99, 102, 241, 0.4);
      --accent-green: #10b981;
      --accent-cyan: #06b6d4;
      --accent-amber: #f59e0b;
      --accent-purple: #a855f7;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(circle at 50% 0%, #171b34 0%, var(--bg) 75%);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      padding: 32px 24px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
      padding-bottom: 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: linear-gradient(135deg, #4f46e5, #06b6d4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      box-shadow: 0 0 20px var(--primary-glow);
    }
    .brand-text h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
    .brand-text p { font-size: 13px; color: var(--text-muted); }
    .header-actions { display: flex; align-items: center; gap: 12px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.12);
      color: var(--accent-green);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .badge::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-green);
      box-shadow: 0 0 8px var(--accent-green);
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .btn {
      background: #1e243d;
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn:hover { background: #2a3356; border-color: var(--primary); }
    .grid-kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 20px;
      backdrop-filter: blur(12px);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
    .kpi-title { font-size: 13px; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-value { font-size: 30px; font-weight: 800; letter-spacing: -1px; margin-bottom: 6px; }
    .kpi-sub { font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }
    .kpi-green { color: var(--accent-green); }
    .kpi-cyan { color: var(--accent-cyan); }
    .kpi-purple { color: var(--accent-purple); }
    .kpi-amber { color: var(--accent-amber); }
    
    .section-title { font-size: 18px; font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .breakdown-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .feature-card {
      background: var(--card-bg);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 16px;
    }
    .feature-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .feature-name { font-weight: 600; font-size: 14px; }
    .feature-count { font-size: 12px; background: rgba(99, 102, 241, 0.2); color: #c7d2fe; padding: 2px 8px; border-radius: 12px; }
    .feature-stats { display: flex; justify-content: space-between; font-size: 13px; color: var(--text-muted); }
    .feature-stats span strong { color: var(--text); }
    
    .table-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 20px;
      overflow-x: auto;
    }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
    th { padding: 12px; color: var(--text-muted); font-weight: 600; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
    td { padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); }
    tr:hover td { background: rgba(255, 255, 255, 0.02); }
    .tag { padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
    .tag-success { background: rgba(16, 185, 129, 0.15); color: var(--accent-green); }
    .tag-feature { background: rgba(99, 102, 241, 0.15); color: #a5b4fc; }
    
    footer {
      margin-top: 40px;
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
      padding-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="brand-icon">⚡</div>
        <div class="brand-text">
          <h1>JEV Decision Engine</h1>
          <p>System One Telemetry & Token Savings · TypeSafe AI</p>
        </div>
      </div>
      <div class="header-actions">
        <span class="badge">ON-DEMAND ACTIVE</span>
        <button class="btn" onclick="fetchData()">🔄 Atualizar</button>
      </div>
    </header>

    <div class="grid-kpis">
      <div class="card">
        <div class="kpi-title">Tokens Poupados</div>
        <div class="kpi-value kpi-purple" id="val-tokens">...</div>
        <div class="kpi-sub">Tokens de contexto economizados</div>
      </div>
      <div class="card">
        <div class="kpi-title">Economia Estimada</div>
        <div class="kpi-value kpi-green" id="val-cost">...</div>
        <div class="kpi-sub">Redução direta na fatura LLM</div>
      </div>
      <div class="card">
        <div class="kpi-title">Tempo Poupado</div>
        <div class="kpi-value kpi-cyan" id="val-time">...</div>
        <div class="kpi-sub">Latência de espera evitada</div>
      </div>
      <div class="card">
        <div class="kpi-title">Decisões Rápidas</div>
        <div class="kpi-value" id="val-decisions">...</div>
        <div class="kpi-sub">Zero tokens LLM gastos</div>
      </div>
      <div class="card">
        <div class="kpi-title">Latência Média JEV</div>
        <div class="kpi-value kpi-amber" id="val-latency">...</div>
        <div class="kpi-sub">vs ~3.200ms LLM padrão</div>
      </div>
    </div>

    <div class="section-title">📊 Economia por Hook & Skill</div>
    <div class="breakdown-grid" id="breakdown-container">
      <!-- Populated via JS -->
    </div>

    <div class="section-title">🕒 Últimas Decisões do Sistema</div>
    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th>Horário</th>
            <th>Feature / Hook</th>
            <th>Latência JEV</th>
            <th>Tokens Poupados</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="entries-body">
          <!-- Populated via JS -->
        </tbody>
      </table>
    </div>

    <footer>
      🔒 Servidor leve executado sob demanda. Pressione <strong>Ctrl+C</strong> no terminal para encerrar e liberar todos os recursos do computador.
    </footer>
  </div>

  <script>
    let currentData = ${JSON.stringify(initialData)};

    function render(data) {
      document.getElementById('val-tokens').innerText = (data.total_tokens_saved || 0).toLocaleString('pt-BR');
      document.getElementById('val-cost').innerText = '$' + (data.total_cost_saved_usd || 0).toFixed(4) + ' USD';
      
      const sec = data.total_time_saved_sec || 0;
      if (sec >= 60) {
        document.getElementById('val-time').innerText = Math.floor(sec / 60) + 'm ' + (sec % 60) + 's';
      } else {
        document.getElementById('val-time').innerText = sec + 's';
      }

      document.getElementById('val-decisions').innerText = (data.total_decisions || 0).toLocaleString('pt-BR');
      document.getElementById('val-latency').innerText = (data.avg_jev_latency_ms || 0) + ' ms';

      // Breakdown
      const bd = document.getElementById('breakdown-container');
      bd.innerHTML = '';
      const feats = data.by_feature || {};
      for (const [feat, info] of Object.entries(feats)) {
        const card = document.createElement('div');
        card.className = 'feature-card';
        card.innerHTML = \`
          <div class="feature-header">
            <span class="feature-name">\${feat}</span>
            <span class="feature-count">\${info.count} decisões</span>
          </div>
          <div class="feature-stats">
            <span>Tokens: <strong>\${info.tokens_saved.toLocaleString('pt-BR')}</strong></span>
            <span>Média: <strong>\${info.avg_latency_ms}ms</strong></span>
            <span>Tempo: <strong>\${info.time_saved_sec}s</strong></span>
          </div>
        \`;
        bd.appendChild(card);
      }

      // Recent entries
      const tbody = document.getElementById('entries-body');
      tbody.innerHTML = '';
      const entries = data.recent_entries || [];
      for (const entry of entries.slice(0, 20)) {
        const tr = document.createElement('tr');
        const dt = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('pt-BR') : '-';
        tr.innerHTML = \`
          <td style="color: var(--text-muted)">\${dt}</td>
          <td><span class="tag tag-feature">\${entry.feature || 'general'}</span></td>
          <td><strong>\${entry.jev_latency_ms || 0} ms</strong></td>
          <td style="color: var(--accent-green); font-weight: 600;">+\${(entry.estimated_llm_tokens_saved || 0).toLocaleString('pt-BR')}</td>
          <td><span class="tag tag-success">\${entry.status || 'success'}</span></td>
        \`;
        tbody.appendChild(tr);
      }
    }

    async function fetchData() {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        render(data);
      } catch (e) {
        console.error('Failed to fetch updated telemetry', e);
      }
    }

    render(currentData);
    setInterval(fetchData, 4000);
  </script>
</body>
</html>`;
}

export function startDashboardServer(options = {}) {
  const port = options.port || 3838;
  const projectDir = options.projectDir || process.cwd();

  const server = http.createServer((req, res) => {
    if (req.url === '/api/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const stats = readTelemetrySummary(projectDir);
      res.end(JSON.stringify(stats));
      return;
    }

    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const stats = readTelemetrySummary(projectDir);
      res.end(createDashboardHtml(stats, projectDir));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️ Porta ${port} em uso. Tentando porta ${port + 1}...`);
      startDashboardServer({ ...options, port: port + 1 });
    } else {
      console.error('Erro no servidor dashboard:', err.message);
    }
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log('\n============================================================');
    console.log('   🚀 JEV DECISION ENGINE — DASHBOARD DE TELEMETRIA');
    console.log('============================================================');
    console.log(`\n  Interface Web:  ${url}`);
    console.log('  Modo:           Sob Demanda (Zero consumo de hardware em repouso)');
    console.log('  Encerramento:   Pressione Ctrl+C para finalizar.\n');

    if (options.openBrowser !== false) {
      exec(`open ${url}`);
    }
  });

  process.on('SIGINT', () => {
    console.log('\n🛑 Encerrando dashboard sob demanda e liberando portas...');
    server.close(() => {
      process.exit(0);
    });
  });

  return server;
}
