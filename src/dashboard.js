import http from 'node:http';
import { exec } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readTelemetrySummary } from './telemetry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// AI-generated logo (Gemini, see docs/jev-logo.png) served as /logo.png.
const LOGO_PATH = path.join(__dirname, '..', 'docs', 'jev-logo.png');
let logoBuffer = null;
try {
  if (existsSync(LOGO_PATH)) logoBuffer = readFileSync(LOGO_PATH);
} catch { logoBuffer = null; }

export function createDashboardHtml(initialData, projectDir) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="/logo.png">
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
      overflow: hidden;
    }
    .brand-mark img { width: 100%; height: 100%; object-fit: cover; display: block; }
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
      color: var(--good);
      border: 1px solid rgba(63,182,139,0.35);
      border-radius: 4px;
      padding: 4px 9px;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      background: transparent;
    }
    .badge::before {
      content: ""; width: 6px; height: 6px; border-radius: 2px;
      background: var(--good); box-shadow: 0 0 6px rgba(63,182,139,0.6);
    }

    /* ---- KPI ---- */
    .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; margin-bottom: 26px; }
    @media (max-width: 1200px) { .kpis { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 800px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
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

    /* ---- Charts ---- */
    .charts-row { display: grid; grid-template-columns: 2fr 1fr; gap: 14px; margin-bottom: 30px; }
    @media (max-width: 1100px) { .charts-row { grid-template-columns: 1fr; } }
    .chart-card {
      background: var(--surface);
      border: 1px solid var(--border); border-radius: 10px;
      padding: 18px 20px;
    }
    .chart-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
    .chart-title { font-weight: 600; font-size: 13px; }
    .chart-sub { font-size: 11px; color: var(--muted); }
    .chart-svg { width: 100%; height: 190px; display: block; }
    .chart-svg .grid-line { stroke: var(--border); stroke-width: 1; }
    .chart-svg .axis-label { fill: var(--muted); font-size: 9px; }
    .chart-svg .bar { fill: var(--accent); }
    .chart-svg .bar:hover { opacity: 0.8; }
    .chart-legend { display: flex; gap: 14px; font-size: 10.5px; color: var(--muted); margin-top: 10px; }
    .chart-legend .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 5px; }
    .chart-legend .dot.lat { background: var(--accent); }
    .chart-legend .dot.tok { background: var(--good); }

    /* ---- Live input stream ---- */
    .stream {
      position: relative;
      max-height: 320px;
      overflow: hidden;
      background: var(--surface);
      border: 1px solid var(--border); border-radius: 10px;
      padding: 6px 0;
      /* Topo (item novo) opaco; fade suave só no rodapé (itens antigos) */
      mask-image: linear-gradient(180deg, #000 0, #000 calc(100% - 72px), transparent 100%);
      -webkit-mask-image: linear-gradient(180deg, #000 0, #000 calc(100% - 72px), transparent 100%);
    }
    .stream-item {
      padding: 9px 18px;
      border-bottom: 1px solid var(--border);
      display: flex; gap: 12px; align-items: baseline;
      opacity: 0.16;
      transition: opacity .6s ease;
      font-size: 12px;
    }
    .stream-item:nth-child(2) { opacity: 0.3; }
    .stream-item:nth-child(3) { opacity: 0.42; }
    .stream-item:nth-child(4) { opacity: 0.52; }
    .stream-item:nth-child(5) { opacity: 0.6; }
    .stream-item:last-child { border-bottom: none; }
    .stream-item .s-time { color: var(--muted); font-size: 10.5px; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .stream-item .s-feat { color: var(--accent); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; font-weight: 600; }
    .stream-item .s-origin { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font-size: 10.5px; white-space: nowrap; max-width: 130px; overflow: hidden; }
    .stream-item .s-origin span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stream-item .s-origin svg { width: 11px; height: 11px; flex-shrink: 0; }
    .stream-item .s-origin .ag-opencode { color: var(--accent); }
    .stream-item .s-origin .ag-claude-code { color: var(--amber); }
    .stream-item .s-origin .ag-codex { color: var(--cyan); }
    .stream-item .s-origin .ag-agy { color: var(--good); }
    .stream-item .s-origin .ag-unknown { color: var(--muted); }
    .stream-item .s-text { color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
    .stream-item.is-new {
      opacity: 1;
    }
    .stream-item.is-new .s-time,
    .stream-item.is-new .s-feat { color: var(--accent); }
    .stream-item.is-new .s-text {
      background: linear-gradient(90deg, var(--fg) 0%, #ffffff 50%, var(--fg) 100%);
      background-size: 200% 100%;
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      animation: shimmerText 2.4s ease 1;
    }
    @keyframes streamIn {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes wheelIn {
      0% { opacity: 0; transform: translateY(-26px) scaleY(0.9); filter: blur(2px); }
      60% { opacity: 1; }
      100% { opacity: 1; transform: translateY(0) scaleY(1); filter: blur(0); }
    }
    @keyframes shimmerText {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* ---- Feature cards ---- */
    .grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border); border-radius: 10px;
      padding: 16px 18px 18px;
      transition: border-color .15s, transform .15s;
    }
    .card:hover { border-color: var(--border-strong); transform: translateY(-1px); }
    .card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .card-title { font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 8px; }
    .card-title .dot { width: 8px; height: 8px; border-radius: 3px; flex-shrink: 0; }
    .card-count { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
    .card-bar { height: 4px; border-radius: 2px; background: var(--surface-2); margin: 12px 0 14px; overflow: hidden; }
    .card-bar .fill { height: 100%; border-radius: 2px; }
    .card-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .stat { min-width: 0; }
    .stat .k { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
    .stat strong { display: block; color: var(--fg); font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

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
      <div class="brand-mark"><img src="/logo.png" alt="JEV Engine logo"></div>
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
      <div class="kpi bar-good">
        <div class="label">JEV spend</div>
        <div class="value" id="val-jevcost">...</div>
        <div class="sub">real cost · TypeSafe</div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-head">
          <div class="chart-title">Latency trend</div>
          <div class="chart-sub">last 50 decisions · ms</div>
        </div>
        <svg class="chart-svg" id="chart-latency" viewBox="0 0 400 190" preserveAspectRatio="none"></svg>
        <div class="chart-legend"><span><span class="dot lat"></span>JEV latency</span></div>
      </div>
      <div class="chart-card">
        <div class="chart-head">
          <div class="chart-title">Tokens by feature</div>
          <div class="chart-sub">cumulative saved</div>
        </div>
        <svg class="chart-svg" id="chart-features" viewBox="0 0 400 190" preserveAspectRatio="none"></svg>
        <div class="chart-legend"><span><span class="dot tok"></span>tokens saved</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <div class="section-title">Live input stream</div>
        <div class="section-note">what JEV just evaluated — newest on top</div>
      </div>
      <div class="stream" id="stream-list"></div>
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
        <a href="https://github.com/daraujo85" target="_blank" rel="noopener">Diego Araújo</a>
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
      document.getElementById('val-jevcost').innerText = '$' + (data.total_jev_cost_usd || 0).toFixed(4);

      const bd = document.getElementById('breakdown-container');
      bd.innerHTML = '';
      const feats = data.by_feature || {};
      const featsArr = Object.entries(feats).sort((a, b) => b[1].tokens_saved - a[1].tokens_saved);
      const maxTokens = Math.max(...featsArr.map(([, f]) => f.tokens_saved), 1);
      const FEAT_COLORS = ['#7c8cf8', '#4cc3d9', '#3fb68b', '#d9a441', '#e2665a', '#a78bfa', '#38bdf8', '#4ade80'];
      const colorFor = s => {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return FEAT_COLORS[h % FEAT_COLORS.length];
      };
      for (const [feat, info] of featsArr) {
        const color = colorFor(feat);
        const pct = Math.max(4, Math.round((info.tokens_saved / maxTokens) * 100));
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = \`
          <div class="card-head">
            <span class="card-title"><span class="dot" style="background:\${color}"></span>\${feat}</span>
            <span class="card-count">\${info.count} calls</span>
          </div>
          <div class="card-bar"><div class="fill" style="width:\${pct}%; background:\${color}"></div></div>
          <div class="card-stats">
            <div class="stat"><div class="k">Tokens</div><strong>\${fmtShort(info.tokens_saved)}</strong></div>
            <div class="stat"><div class="k">Avg</div><strong>\${info.avg_latency_ms} ms</strong></div>
            <div class="stat"><div class="k">Time</div><strong>\${fmtSec(info.time_saved_sec)}</strong></div>
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

      renderLatencyChart(entries);
      renderFeatureBars(data.by_feature || {});
      renderStream(entries);
    }

    // --- Live input stream (newest shimmer, older faded) ---
    let streamItems = [];
    let lastTopKey = '';
    function renderStream(entries) {
      const items = (entries || []).slice(0, 12);
      if (items.length === 0) return;
      const top = items[0];
      const key = (top.timestamp || '') + '_' + (top.feature || '') + '_' + (top.jev_latency_ms || '') + '_' + (top.input_preview || '').slice(0, 40);
      // Only animate when a genuinely new line arrived (new top key).
      if (key === lastTopKey) {
        // keep list in sync (e.g. counts changed) without scroll animation
        streamItems = items;
        return;
      }
      const hadItems = streamItems.length > 0;
      lastTopKey = key;
      streamItems = items;
      const list = document.getElementById('stream-list');
      if (!hadItems) {
        paintStream(false);
        return;
      }
      // New line: prepend with a smooth "wheel" drop, drop the oldest.
      const e = top;
      const t = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('pt-BR', { hour12: false }) : '--:--:--';
      const text = e.input_preview || (e.feature || 'general') + ' evaluation';
      const el = document.createElement('div');
      el.className = 'stream-item is-new';
      el.innerHTML = '<span class="s-time">' + t + '</span>' +
        '<span class="s-feat">' + (e.feature || 'general') + '</span>' +
        '<span class="s-origin">' + originLabel(e) + '</span>' +
        '<span class="s-text">' + escapeHtml(text) + '</span>';
      list.insertBefore(el, list.firstChild);
      // drop oldest to keep the list bounded
      while (list.children.length > 10) list.removeChild(list.lastChild);
      // re-fade all existing (they shift down)
      for (let i = 0; i < list.children.length; i++) {
        const c = list.children[i];
        if (i === 0) continue;
        c.classList.remove('is-new');
        c.style.opacity = String(Math.max(0.16, 0.9 - i * 0.11));
      }
      // wheel easing on the incoming item
      el.style.animation = 'wheelIn 0.7s cubic-bezier(0.22, 1, 0.36, 1)';
    }
    function paintStream(animate) {
      const list = document.getElementById('stream-list');
      let html = '';
      streamItems.forEach((e, i) => {
        const cls = i === 0 && animate ? 'stream-item is-new' : 'stream-item';
        const t = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('pt-BR', { hour12: false }) : '--:--:--';
        const text = e.input_preview || (e.feature || 'general') + ' evaluation';
        html += '<div class="' + cls + '">' +
          '<span class="s-time">' + t + '</span>' +
          '<span class="s-feat">' + (e.feature || 'general') + '</span>' +
          '<span class="s-origin">' + originLabel(e) + '</span>' +
          '<span class="s-text">' + escapeHtml(text) + '</span>' +
          '</div>';
      });
      list.innerHTML = html;
    }
    function escapeHtml(s) {
      return String(s || '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
      ));
    }
    // --- per-agent SVG marks (real brand shapes, colors follow dashboard tokens) ---
    const AGENT_SVGS = {
      // OpenCode (anomalyco) — stepped O
      'opencode': '<svg viewBox="0 0 24 24" class="ag-opencode" fill="currentColor" aria-hidden="true"><path d="M8.4 17.4H19.2V21H4.8v-7.2h3.6v3.6zm7.2-7.2v3.6H8.4v-3.6h7.2zm3.6 0h-3.6V6.6H4.8V3h14.4v7.2z"/></svg>',
      // Claude Code (Anthropic) — asterisk
      'claude-code': '<svg viewBox="0 0 24 24" class="ag-claude-code" fill="currentColor" aria-hidden="true"><path d="M17.304 3.541h-3.672l6.696 16.918H24L17.304 3.541zm-10.608 0L0 20.459h3.744l1.37-3.553h7.005l1.37 3.553h3.744L10.536 3.541zm-.371 10.223 2.291-5.946 2.291 5.946z"/></svg>',
      // Codex (OpenAI) — knot
      'codex': '<svg viewBox="0 0 24 24" class="ag-codex" fill="currentColor" aria-hidden="true"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.901 6.065 6.065 0 0 0-7.275 1.172 5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.096 5.98 5.98 0 0 0 .511 4.911 6.051 6.051 0 0 0 6.514 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.998-2.9 6.056 6.056 0 0 0-.748-7.073zm-9.022 12.608a4.475 4.475 0 0 1-2.876-1.04l.141-.084 4.101-2.367a4.524 4.524 0 0 1 1.337 1.94 4.383 4.383 0 0 1-.632 3.012 3.8 3.8 0 0 1-.907.762 4.458 4.458 0 0 1-1.164-2.223zm-8.693-5.192a4.447 4.447 0 0 1-.913-.602l6.27-3.617a4.525 4.525 0 0 1-.386 2.326 4.397 4.397 0 0 1-1.921 2.392 3.845 3.845 0 0 1-.907.763 4.466 4.466 0 0 1-1.143-2.262zm-1.67-7.255a4.447 4.447 0 0 1 1.057-.333l.074.086.102 7.23a4.521 4.521 0 0 1-2.362.226 4.393 4.393 0 0 1-2.544-1.73 3.857 3.857 0 0 1-.433-.906 4.477 4.477 0 0 1 2.106-1.573zm8.723-5.411c.137-.054.28-.105.43-.15l3.662 6.23-.009.111a4.527 4.527 0 0 1-2.35-1.033 4.398 4.398 0 0 1-1.42-2.631 3.83 3.83 0 0 1 .032-1.023 4.45 4.45 0 0 1 1.655-.504zm-4.535 2.879a4.536 4.536 0 0 1 1.468-.65l.109.017 4.853 5.362-.069.088a4.523 4.523 0 0 1-2.564.287 4.393 4.393 0 0 1-2.446-1.403 3.843 3.843 0 0 1-.6-.837 4.463 4.463 0 0 1-.751-1.864zm10.584 2.121c.152.006.303.018.45.034l1.25 7.133-.05.098a4.523 4.523 0 0 1-2.236-1.085 4.392 4.392 0 0 1-1.18-2.626 3.84 3.84 0 0 1 .218-1.002 4.468 4.468 0 0 1 1.548-2.552zm-6.134 6.07a4.5 4.5 0 0 1-1.521-.385L7.013 10.4c.006-.036.008-.072.014-.108a4.523 4.523 0 0 1 2.546.18 4.39 4.39 0 0 1 2.295 1.59 3.845 3.845 0 0 1 .533.895 4.463 4.463 0 0 1 .607 2.231zm-2.64 5.617-4.18-2.401a4.521 4.521 0 0 1 1.782-1.589l4.183 2.407a3.89 3.89 0 0 1-.652 1.233 4.476 4.476 0 0 1-1.133.35z"/></svg>',
      // AntGravity (Google) — broken star
      'agy': '<svg viewBox="0 0 24 24" class="ag-agy" fill="currentColor" aria-hidden="true"><path d="M21.751 22.607c1.34 1.005 3.35.335 1.508-1.508C17.73 15.74 18.904 1 12.037 1 5.17 1 6.342 15.74.815 21.1c-2.01 2.009.167 2.511 1.507 1.506 5.192-3.517 4.857-9.714 9.715-9.714 4.857 0 4.522 6.197 9.714 9.715z"/></svg>',
      // unknown — question mark
      'unknown': '<svg viewBox="0 0 24 24" class="ag-unknown" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1.5 1-1.5 2v.7"/><circle cx="11.5" cy="17" r="0.4" fill="currentColor"/></svg>'
    };
    function agentSvg(agent) {
      return AGENT_SVGS[agent] || AGENT_SVGS.unknown;
    }
    function agentLabel(agent) {
      const map = { opencode: 'OpenCode', 'claude-code': 'Claude Code', codex: 'Codex', agy: 'AntGravity', unknown: 'CLI' };
      return map[agent] || 'CLI';
    }
    function originLabel(e) {
      const agent = e.origin_agent || 'unknown';
      const proj = projectShort(e.origin_project);
      return agentSvg(agent) + '<span>' + escapeHtml(agentLabel(agent)) + (proj ? ' · ' + escapeHtml(proj) : '') + '</span>';
    }
function projectShort(p) {
      if (!p) return '';
      const s = String(p).replace(/[\\/]+$/, '');
      const parts = s.split('/');
      return parts[parts.length - 1] || s;
    }

    // --- Latency line/area chart (inline SVG, last 50 decisions) ---
    function renderLatencyChart(entries) {
      const svg = document.getElementById('chart-latency');
      const W = 400, H = 190, pad = 8;
      const pts = (entries || []).slice(0, 50).reverse();
      const vals = pts.map(e => e.jev_latency_ms || 0);
      if (vals.length === 0) { svg.innerHTML = ''; return; }

      const max = Math.max(...vals, 1);
      const min = Math.min(...vals, 0);
      const range = Math.max(max - min, 1);
      const x = i => pts.length === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (pts.length - 1);
      const y = v => H - pad - ((v - min) / range) * (H - 2 * pad);

      const points = vals.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
      const area = 'M' + x(0) + ',' + (H - pad) + ' L' + vals.map((v, i) => x(i) + ',' + y(v)).join(' L') + ' L' + x(vals.length - 1) + ',' + (H - pad) + ' Z';

      let grid = '';
      for (let g = 0; g <= 3; g++) {
        const gy = pad + (g * (H - 2 * pad)) / 3;
        grid += '<line class="grid-line" x1="' + pad + '" y1="' + gy + '" x2="' + (W - pad) + '" y2="' + gy + '"/>';
      }

      svg.innerHTML = grid +
        '<polyline fill="none" stroke="#7c8cf8" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="' + points + '"/>' +
        '<polygon fill="rgba(124,140,248,0.12)" points="' + area + '"/>' +
        '<text class="axis-label" x="' + (W - pad) + '" y="' + (H - pad - 4) + '" text-anchor="end">' + max + 'ms max</text>' +
        '<text class="axis-label" x="' + (W - pad) + '" y="' + (pad + 10) + '" text-anchor="end">last ' + pts.length + ' decisions</text>';
    }

    // --- Horizontal bars: tokens saved per feature (top 6) ---
    function renderFeatureBars(byFeature) {
      const svg = document.getElementById('chart-features');
      const W = 400, H = 190, pad = 8, barH = 16, gap = 18;
      const feats = Object.entries(byFeature || {})
        .sort((a, b) => b[1].tokens_saved - a[1].tokens_saved)
        .slice(0, 6);
      if (feats.length === 0) { svg.innerHTML = ''; return; }

      const max = Math.max(...feats.map(([, f]) => f.tokens_saved), 1);
      const labelW = 96, barMax = W - pad - labelW - pad;
      let out = '';
      feats.forEach(([name, f], i) => {
        const y = pad + i * gap + 4;
        const w = Math.max(4, (f.tokens_saved / max) * barMax);
        out += '<text class="axis-label" x="' + pad + '" y="' + (y + barH - 4) + '">' + truncate(name, 14) + '</text>' +
          '<rect class="bar" x="' + (pad + labelW) + '" y="' + y + '" width="' + w.toFixed(1) + '" height="' + barH + '" rx="3"/>';
      });
      svg.innerHTML = out +
        '<text class="axis-label" x="' + (W - pad) + '" y="' + (H - pad - 2) + '" text-anchor="end">' + fmtShort(max) + ' tokens</text>';
    }

    function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
    function fmtShort(v) {
      if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
      if (v >= 1e3) return (v / 1e3).toFixed(0) + 'k';
      return String(v);
    }
    function fmtSec(s) {
      s = s || 0;
      if (s >= 3600) return (s / 3600).toFixed(1) + 'h';
      if (s >= 60) return Math.round(s / 60) + 'm';
      return s + 's';
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

    if (req.url === '/logo.png' && logoBuffer) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=300' });
      res.end(logoBuffer);
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