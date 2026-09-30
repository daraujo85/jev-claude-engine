import http from 'node:http';
import { exec } from 'node:child_process';
import { readTelemetrySummary } from './telemetry.js';

export function createDashboardHtml(initialData, projectDir) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JEV System One — Telemetry Dashboard</title>
  <style>
    :root {
      --bg: #0d0f14;
      --surface: #14171f;
      --surface-2: #1a1e28;
      --border: #232834;
      --border-strong: #2c3342;
      --fg: #e8eaf0;
      --muted: #8a91a3;
      --accent: #7c8cf8;
      --accent-dim: rgba(124, 140, 248, 0.12);
      --good: #3fb68b;
      --good-dim: rgba(63, 182, 139, 0.12);
      --bad: #e2665a;
      --amber: #d9a441;
      --amber-dim: rgba(217, 164, 65, 0.12);
      --cyan: #4cc3d9;
      --cyan-dim: rgba(76, 195, 217, 0.12);
      --sidebar-w: 232px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--fg);
      font: 13.5px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
      display: grid;
      grid-template-columns: var(--sidebar-w) 1fr;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }

    /* ---- Sidebar ---- */
    .sidebar {
      background: var(--surface);
      border-right: 1px solid var(--border);
      padding: 20px 14px;
      position: sticky;
      top: 0;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 8px 20px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
    }
    .brand-mark {
      width: 34px; height: 34px;
      border-radius: 9px;
      flex-shrink: 0;
      display: grid; place-items: center;
      background: var(--surface-2);
      border: 1px solid var(--border-strong);
    }
    .brand-mark svg { width: 22px; height: 22px; display: block; }
    .brand-mark svg .mark-glow { filter: drop-shadow(0 0 6px rgba(124,140,248,0.35)); }
    .brand-name { font-weight: 650; font-size: 13.5px; letter-spacing: -0.01em; }
    .brand-sub { font-size: 10.5px; color: var(--muted); letter-spacing: 0.02em; }
    .nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .nav-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; padding: 14px 10px 6px; }
    .nav-item {
      display: flex; align-items: center; gap: 9px;
      padding: 8px 10px; border-radius: 7px;
      color: var(--muted); text-decoration: none; font-size: 12.5px;
    }
    .nav-item svg { width: 15px; height: 15px; flex-shrink: 0; opacity: 0.8; }
    .nav-item.active { background: var(--accent-dim); color: var(--fg); font-weight: 550; }
    .nav-item.active svg { opacity: 1; color: var(--accent); }
    .nav-item:hover { background: var(--surface-2); color: var(--fg); }
    .sidebar-foot { font-size: 10.5px; color: var(--muted); padding: 12px 10px 4px; border-top: 1px solid var(--border); line-height: 1.5; }

    /* ---- Main ---- */
    main { padding: 0 30px 48px; min-width: 0; }
    .topbar {
      padding: 20px 0 18px;
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid var(--border); margin-bottom: 26px;
      position: sticky; top: 0; background: var(--bg); z-index: 10;
    }
    .topbar h1 { font-size: 19px; font-weight: 650; letter-spacing: -0.015em; }
    .topbar .crumb { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
    .topbar .right { display: flex; align-items: center; gap: 10px; }
    .btn {
      font: inherit; cursor: pointer; padding: 7px 13px; border-radius: 7px;
      background: transparent; color: var(--fg); border: 1px solid var(--border-strong);
      transition: border-color .15s, background .15s;
    }
    .btn:hover { border-color: var(--accent); background: var(--accent-dim); }
    .badge {
      display: inline-flex; align-items: center; gap: 7px;
      font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--good); background: var(--good-dim);
      border: 1px solid rgba(63,182,139,0.28);
      padding: 5px 11px; border-radius: 999px;
    }
    .badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--good); }

    /* ---- KPI ---- */
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 26px; }
    @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
    .kpi {
      background: var(--surface);
      border: 1px solid var(--border); border-radius: 10px;
      padding: 16px 18px;
      position: relative; overflow: hidden;
    }
    .kpi::after {
      content: ""; position: absolute; inset: 0 0 auto 0; height: 2px;
      background: var(--kpi-bar, var(--accent)); opacity: 0.9;
    }
    .kpi .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; }
    .kpi .value { font-size: 27px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; font-variant-numeric: tabular-nums; }
    .kpi .sub { font-size: 11.5px; color: var(--muted); margin-top: 6px; }
    .kpi .sub .cmp { color: var(--fg); font-weight: 550; }
    .bar-good { --kpi-bar: var(--good); }
    .bar-accent { --kpi-bar: var(--accent); }
    .bar-cyan { --kpi-bar: var(--cyan); }
    .bar-amber { --kpi-bar: var(--amber); }

    /* ---- Sections ---- */
    .section { margin-bottom: 30px; }
    .section-head {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 14px;
    }
    .section-title { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
    .section-note { font-size: 11.5px; color: var(--muted); }

    /* ---- Feature cards ---- */
    .grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border); border-radius: 10px;
      padding: 16px 18px;
    }
    .card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .card-title { font-weight: 600; font-size: 13px; }
    .card-count { font-size: 11px; color: var(--accent); background: var(--accent-dim); padding: 2px 9px; border-radius: 999px; font-variant-numeric: tabular-nums; }
    .card-stats { display: flex; gap: 18px; font-size: 12px; color: var(--muted); }
    .card-stats .stat strong { display: block; color: var(--fg); font-size: 13.5px; font-weight: 600; font-variant-numeric: tabular-nums; margin-bottom: 1px; }

    /* ---- Table ---- */
    .table-wrap {
      background: var(--surface);
      border: 1px solid var(--border); border-radius: 10px;
      overflow: hidden;
    }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    th {
      text-align: left; padding: 11px 18px; font-size: 10.5px; font-weight: 600;
      color: var(--muted); text-transform: uppercase; letter-spacing: 0.07em;
      border-bottom: 1px solid var(--border); background: var(--surface-2);
    }
    td { padding: 11px 18px; border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(255,255,255,0.015); }
    .td-muted { color: var(--muted); }
    .tag {
      display: inline-block; font-size: 10.5px; font-weight: 600;
      padding: 2px 9px; border-radius: 999px;
    }
    .tag-feature { color: var(--accent); background: var(--accent-dim); }
    .tag-status { color: var(--good); background: var(--good-dim); }

    /* ---- Footer ---- */
    footer {
      margin-top: 36px; padding-top: 18px;
      border-top: 1px solid var(--border);
      display: flex; justify-content: space-between; align-items: center;
      font-size: 11.5px; color: var(--muted);
    }
    footer .links { display: flex; gap: 18px; align-items: center; }
    footer a { color: var(--muted); text-decoration: none; transition: color .15s; }
    footer a:hover { color: var(--fg); }
    footer .sep { opacity: 0.4; }
  </style>
</head>
<body>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">
        <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="jev-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#7c8cf8"/>
              <stop offset="1" stop-color="#4cc3d9"/>
            </linearGradient>
          </defs>
          <g class="mark-glow">
            <!-- J lettermark, constructed geometric strokes -->
            <path d="M12 8h8" stroke="url(#jev-grad)" stroke-width="2.4" stroke-linecap="round"/>
            <path d="M12 8v13" stroke="url(#jev-grad)" stroke-width="2.4" stroke-linecap="round"/>
            <path d="M12 21h6.5" stroke="url(#jev-grad)" stroke-width="2.4" stroke-linecap="round"/>
            <!-- decision nucleus: single node choosing among paths -->
            <path d="M23.5 9.5l3-3M23.5 9.5l3 3M23.5 9.5h-4" stroke="url(#jev-grad)" stroke-width="1.6" stroke-linecap="round"/>
            <circle cx="23.5" cy="9.5" r="2.6" fill="#0d0f14" stroke="url(#jev-grad)" stroke-width="1.6"/>
          </g>
        </svg>
      </div>
      <div>
        <div class="brand-name">JEV Engine</div>
        <div class="brand-sub">System One · TypeSafe AI</div>
      </div>
    </div>
    <nav class="nav">
      <span class="nav-label">Overview</span>
      <a href="#" class="nav-item active">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
        Telemetry
      </a>
      <a href="#" class="nav-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10m6 10V4m6 16v-7m6 7H2"/></svg>
        Hooks &amp; Skills
      </a>
      <a href="#" class="nav-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg>
        Guardrails
      </a>
      <span class="nav-label">System</span>
      <a href="#" class="nav-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>
        Settings
      </a>
    </nav>
    <div class="sidebar-foot">
      Sub-300ms decision engine.<br>
      Fail-open on any failure.
    </div>
  </aside>

  <main>
    <div class="topbar">
      <div>
        <h1>System telemetry</h1>
        <div class="crumb">JEV System One · real-time decisions</div>
      </div>
      <div class="right">
        <span class="badge">On-demand</span>
        <button class="btn" onclick="fetchData()">Refresh</button>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi bar-accent">
        <div class="label">Tokens saved</div>
        <div class="value" id="val-tokens">...</div>
        <div class="sub">context kept out of the LLM</div>
      </div>
      <div class="kpi bar-good">
        <div class="label">Estimated savings</div>
        <div class="value" id="val-cost">...</div>
        <div class="sub">direct billing reduction</div>
      </div>
      <div class="kpi bar-cyan">
        <div class="label">Time saved</div>
        <div class="value" id="val-time">...</div>
        <div class="sub">LLM wait avoided</div>
      </div>
      <div class="kpi bar-amber">
        <div class="label">Fast decisions</div>
        <div class="value" id="val-decisions">...</div>
        <div class="sub">avg latency <span class="cmp" id="val-latency">...</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <div class="section-title">Savings by hook and skill</div>
        <div class="section-note">tokens saved and latency per feature</div>
      </div>
      <div class="grid" id="breakdown-container"></div>
    </div>

    <div class="section">
      <div class="section-head">
        <div class="section-title">Latest decisions</div>
        <div class="section-note">the 20 most recent</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Feature / Hook</th>
              <th>JEV latency</th>
              <th>Tokens saved</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="entries-body"></tbody>
        </table>
      </div>
    </div>

    <footer>
      <div>Lightweight on-demand server — Ctrl+C in the terminal stops it and frees all resources.</div>
      <div class="links">
        <a href="https://devsync.com.br" target="_blank" rel="noopener">devsync.com.br</a>
        <span class="sep">·</span>
        <a href="https://www.linkedin.com/company/devsync" target="_blank" rel="noopener">LinkedIn</a>
        <span class="sep">·</span>
        <span>by Diego Araújo</span>
      </div>
    </footer>
  </main>

  <script>
    let currentData = ${JSON.stringify(initialData)};

    function render(data) {
      document.getElementById('val-tokens').innerText = (data.total_tokens_saved || 0).toLocaleString('pt-BR');
      document.getElementById('val-cost').innerText = '$' + (data.total_cost_saved_usd || 0).toFixed(2);

      const sec = data.total_time_saved_sec || 0;
      document.getElementById('val-time').innerText = sec >= 60
        ? Math.floor(sec / 60) + ' min'
        : sec + ' s';

      document.getElementById('val-decisions').innerText = (data.total_decisions || 0).toLocaleString('pt-BR');
      document.getElementById('val-latency').innerText = (data.avg_jev_latency_ms || 0) + ' ms';

      const bd = document.getElementById('breakdown-container');
      bd.innerHTML = '';
      const feats = data.by_feature || {};
      for (const [feat, info] of Object.entries(feats)) {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = \`
          <div class="card-head">
            <span class="card-title">\${feat}</span>
            <span class="card-count">\${info.count} decisões</span>
          </div>
          <div class="card-stats">
            <div class="stat">Tokens<strong>\${info.tokens_saved.toLocaleString('pt-BR')}</strong></div>
            <div class="stat">Média<strong>\${info.avg_latency_ms} ms</strong></div>
            <div class="stat">Tempo<strong>\${info.time_saved_sec} s</strong></div>
          </div>
        \`;
        bd.appendChild(card);
      }

      const tbody = document.getElementById('entries-body');
      tbody.innerHTML = '';
      const entries = data.recent_entries || [];
      for (const entry of entries.slice(0, 20)) {
        const tr = document.createElement('tr');
        const dt = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('pt-BR') : '-';
        tr.innerHTML = \`
          <td class="td-muted">\${dt}</td>
          <td><span class="tag tag-feature">\${entry.feature || 'general'}</span></td>
          <td>\${entry.jev_latency_ms || 0} ms</td>
          <td style="color: var(--good); font-weight: 600;">+\${(entry.estimated_llm_tokens_saved || 0).toLocaleString('pt-BR')}</td>
          <td><span class="tag tag-status">\${entry.status || 'success'}</span></td>
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
    console.log('   JEV DECISION ENGINE — DASHBOARD DE TELEMETRIA');
    console.log('============================================================');
    console.log(`\n  Interface Web:  ${url}`);
    console.log('  Modo:           Sob Demanda (Zero consumo de hardware em repouso)');
    console.log('  Encerramento:   Pressione Ctrl+C para finalizar.\n');

    if (options.openBrowser !== false) {
      exec(`open ${url}`);
    }
  });

  process.on('SIGINT', () => {
    console.log('\nEncerrando dashboard sob demanda e liberando portas...');
    server.close(() => {
      process.exit(0);
    });
  });

  return server;
}