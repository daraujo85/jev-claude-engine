import http from 'node:http';
import { exec } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readTelemetrySummary } from './telemetry.js';
import { loadConfig, saveConfig, resetConfig, DEFAULT_CONFIG, deepMerge } from './jev-config.js';
import { listModels, profileModels, suggestCombos, routerFeatures } from './model-router.js';
import { STRINGS, DEFAULT_LANG, currentLang } from './i18n.js';
import { envKey } from './providers.js';
import { gatewayToken } from './model-router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// AI-generated logo (Gemini, see docs/jev-logo.png) served as /logo.png.
const LOGO_PATH = path.join(__dirname, '..', 'docs', 'jev-logo.png');
let logoBuffer = null;
try {
  if (existsSync(LOGO_PATH)) logoBuffer = readFileSync(LOGO_PATH);
} catch { logoBuffer = null; }

export function createDashboardHtml(initialData, projectDir) {
  const uiLang = currentLang(loadConfig());
  return `<!DOCTYPE html>
<html lang="${uiLang}">
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
    .kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; margin-bottom: 26px; }
    @media (max-width: 1400px) { .kpis { grid-template-columns: repeat(3, 1fr); } }
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
    .stream-item .s-type {
      display: inline-block; font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em;
      text-transform: uppercase; padding: 1px 7px; border-radius: 4px; white-space: nowrap;
    }
    .stream-item .s-type.t-choice { color: var(--accent); background: var(--accent-dim); border: 1px solid rgba(124,140,248,0.3); }
    .stream-item .s-type.t-noul { color: var(--good); background: var(--good-dim); border: 1px solid rgba(63,182,139,0.3); }
    .stream-item .s-type.t-score { color: var(--cyan); background: var(--cyan-dim); border: 1px solid rgba(76,195,217,0.3); }
    .stream-item .s-type.t-empty { color: var(--muted); border: 1px solid var(--border-strong); }
    .stream-item .s-result { color: var(--fg); font-size: 11px; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .stream-item .s-result.good { color: var(--good); }
    .stream-item .s-result.bad { color: var(--bad); }
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

    /* ---- Config (Hooks & Skills) ---- */
    .cfg-item {
      background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
      padding: 13px 18px; display: flex; align-items: center; gap: 14px;
      margin-bottom: 10px;
    }
    .cfg-item .cfg-icon {
      width: 34px; height: 34px; border-radius: 8px; flex-shrink: 0;
      display: grid; place-items: center;
      background: var(--surface-2); border: 1px solid var(--border-strong);
    }
    .cfg-item .cfg-icon svg { width: 18px; height: 18px; color: var(--accent); }
    .cfg-item .cfg-meta { min-width: 0; flex: 1; }
    .cfg-item .cfg-name { font-weight: 600; font-size: 12.5px; display: inline-flex; align-items: center; gap: 6px; }
    .cfg-item .cfg-desc { font-size: 11px; color: var(--muted); margin-top: 2px; }
    .cfg-info {
      display: inline-grid; place-items: center; width: 15px; height: 15px;
      border: none; background: transparent; color: var(--muted); cursor: help; padding: 0;
      position: relative;
    }
    .cfg-info svg { width: 14px; height: 14px; }
    .cfg-info:hover { color: var(--accent); }
    .cfg-info::after {
      content: attr(data-tip);
      position: absolute; z-index: 50;
      top: calc(100% + 8px); left: 0;
      width: 300px; max-width: 70vw;
      padding: 10px 12px;
      background: #0d0f14; color: var(--fg);
      border: 1px solid var(--border-strong); border-radius: 8px;
      font-size: 11px; line-height: 1.5; font-weight: 400; text-align: left;
      white-space: normal;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      opacity: 0; pointer-events: none;
      transform: translateY(-4px);
      transition: opacity .15s ease, transform .15s ease;
    }
    .cfg-info:hover::after { opacity: 1; transform: translateY(0); }
    .cfg-controls { display: flex; align-items: center; gap: 14px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
    .cfg-field { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); white-space: nowrap; }
    .cfg-field input {
      width: 58px; background: var(--surface-2); border: 1px solid var(--border-strong);
      color: var(--fg); border-radius: 5px; padding: 4px 6px; font-size: 11.5px;
      font-variant-numeric: tabular-nums;
    }
    .toggle { position: relative; width: 34px; height: 19px; flex-shrink: 0; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle .slider {
      position: absolute; inset: 0; border-radius: 999px; cursor: pointer;
      background: var(--surface-2); border: 1px solid var(--border-strong); transition: .2s;
    }
    .toggle .slider::before {
      content: ""; position: absolute; width: 13px; height: 13px; left: 2px; top: 2px;
      border-radius: 50%; background: var(--muted); transition: .2s;
    }
    .toggle input:checked + .slider { background: rgba(63,182,139,0.25); border-color: var(--good); }
    .toggle input:checked + .slider::before { transform: translateX(15px); background: var(--good); }
    .config-actions { display: flex; gap: 10px; margin-top: 6px; }
    .config-actions .btn-primary {
      background: var(--good); color: #0d0f14; border: 1px solid var(--good); font-weight: 650;
    }
    .config-actions .btn-primary:hover { filter: brightness(1.1); background: var(--good); border-color: var(--good); }
    .save-msg { font-size: 11.5px; color: var(--good); min-height: 16px; align-self: center; }
    .save-msg.err { color: var(--bad); }

    /* ---- Mobile (<= 900px) ---- */
    @media (max-width: 900px) {
      body { grid-template-columns: 1fr; }
      .sidebar {
        position: static; height: auto; flex-direction: row;
        align-items: center; gap: 10px; padding: 10px 14px;
        border-right: none; border-bottom: 1px solid var(--border);
        overflow-x: auto;
      }
      .brand { padding: 0 4px 0 0; border-bottom: none; margin-bottom: 0; flex-shrink: 0; }
      .brand-mark { width: 30px; height: 30px; }
      .brand-sub { display: none; }
      .nav { flex-direction: row; gap: 4px; flex: 1; }
      .nav-label { display: none; }
      .nav-item { padding: 7px 9px; font-size: 12px; white-space: nowrap; }
      .nav-item svg { display: none; }
      .sidebar-foot { display: none; }
      main { padding: 0 14px 32px; }
      .topbar { padding: 14px 0 12px; margin-bottom: 18px; }
      .topbar h1 { font-size: 16px; }
      .topbar .crumb { font-size: 10.5px; }
      .kpis { grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .charts-row { grid-template-columns: 1fr; }
      .section-title { font-size: 13.5px; }
      .cfg-item { flex-wrap: wrap; padding: 12px 14px; align-items: flex-start; position: relative; }
      .cfg-item .cfg-icon { width: 30px; height: 30px; }
      .cfg-item .cfg-icon svg { width: 16px; height: 16px; }
      .cfg-meta { flex-basis: calc(100% - 48px); padding-right: 44px; }
      .cfg-controls {
        flex-basis: 100%; justify-content: flex-start; gap: 8px 14px;
        padding-top: 10px; border-top: 1px solid var(--border); margin-top: 2px;
      }
      .cfg-controls .toggle { position: absolute; right: 14px; top: 14px; }
      .cfg-info::after { width: 220px; left: auto; right: 0; }
      .stream { max-height: 260px; }
      .stream-item { padding: 8px 12px; font-size: 11px; flex-wrap: wrap; gap: 6px; }
      .stream-item .s-text { white-space: normal; overflow: visible; flex-basis: 100%; }
      footer { flex-direction: column; gap: 8px; align-items: flex-start; }
      .config-actions { flex-wrap: wrap; }
    }
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
      <span class="nav-label" data-i18n="navOverview">Overview</span>
      <a href="#" class="nav-item active" data-view="telemetry" onclick="showView('telemetry')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
        <span data-i18n="navTelemetry">Telemetry</span>
      </a>
      <a href="#" class="nav-item" data-view="config" onclick="showView('config')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10m6 10V4m6 16v-7m6 7H2"/></svg>
        <span data-i18n="navConfig">Hooks &amp; Skills</span>
      </a>
      <a href="#" class="nav-item" data-view="guardrails" onclick="showView('guardrails')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg>
        <span data-i18n="navGuardrails">Guardrails</span>
      </a>
      <a href="#" class="nav-item" data-view="router" onclick="showView('router')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M3 8h18M7 15h3"/><circle cx="17" cy="15" r="1.6"/></svg>
        <span data-i18n="navRouter">9Router</span>
      </a>
      <span class="nav-label" data-i18n="navSystem">System</span>
      <a href="#" class="nav-item" data-view="settings" onclick="showView('settings')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>
        <span data-i18n="navSettings">Settings</span>
      </a>
    </nav>
    <div class="sidebar-foot">
      <span data-i18n="foot1">Sub-300ms decision engine.</span><br>
      <span data-i18n="foot2">Fail-open on any failure.</span>
    </div>
  </aside>

  <main>
    <div class="topbar">
      <div>
        <h1 id="page-title">System telemetry</h1>
        <div class="crumb" id="page-crumb">JEV System One · real-time decisions</div>
      </div>
      <div class="right">
        <span class="badge" data-i18n="onDemand">On-demand</span>
        <select id="lang-select" class="btn" style="margin-right:8px;cursor:pointer;" data-i18n-tooltip="langSelect" title="Language" onchange="setLang(this.value)">
          <option value="en">🇺🇸 English</option>
          <option value="pt-BR">🇧🇷 Português</option>
          <option value="es">🇪🇸 Español</option>
          <option value="fr">🇫🇷 Français</option>
          <option value="de">🇩🇪 Deutsch</option>
          <option value="zh">🇨🇳 中文</option>
          <option value="it">🇮🇹 Italiano</option>
        </select>
        <button class="btn" id="refresh-btn" onclick="fetchData()" data-i18n="refresh">Refresh</button>
      </div>
    </div>

    <!-- VIEW: Telemetry -->
    <div id="view-telemetry">
      <div class="kpis">
        <div class="kpi bar-accent">
          <div class="label" data-i18n="kpiTokensSaved">Tokens saved</div>
          <div class="value" id="val-tokens">...</div>
          <div class="sub" data-i18n="kpiTokensSavedSub">context kept out of the LLM</div>
        </div>
        <div class="kpi bar-good">
          <div class="label" data-i18n="kpiEstSavings">Estimated savings</div>
          <div class="value" id="val-cost">...</div>
          <div class="sub" data-i18n="kpiEstSavingsSub">direct billing reduction</div>
        </div>
        <div class="kpi bar-cyan">
          <div class="label" data-i18n="kpiTimeSaved">Time saved</div>
          <div class="value" id="val-time">...</div>
          <div class="sub" data-i18n="kpiTimeSavedSub">LLM wait avoided</div>
        </div>
        <div class="kpi bar-amber">
          <div class="label" data-i18n="kpiFastDecisions">Fast decisions</div>
          <div class="value" id="val-decisions">...</div>
          <div class="sub"><span data-i18n="kpiFastDecisionsSub">avg latency</span> <span class="cmp" id="val-latency">...</span></div>
        </div>
        <div class="kpi bar-amber">
          <div class="label" data-i18n="kpiRequests">Requests</div>
          <div class="value" id="val-requests">...</div>
          <div class="sub" data-i18n="kpiRequestsSub">total evaluated</div>
        </div>
        <div class="kpi bar-good">
          <div class="label" data-i18n="kpiJevSpend">JEV spend</div>
          <div class="value" id="val-jevcost">...</div>
          <div class="sub" data-i18n="kpiJevSpendSub">real cost · TypeSafe</div>
        </div>
        <div class="kpi bar-cyan">
          <div class="label" data-i18n="kpiJevBalance">JEV balance</div>
          <div class="value" id="val-jevbalance">...</div>
          <div class="sub" data-i18n="kpiJevBalanceSub">remaining of initial credit</div>
        </div>
        <div class="kpi bar-cyan">
          <div class="label" data-i18n="kpiJevInputTokens">JEV input tokens</div>
          <div class="value" id="val-jevinput">...</div>
          <div class="sub" data-i18n="kpiJevInputTokensSub">tokens sent to System One</div>
        </div>
      </div>

      <div class="charts-row">
        <div class="chart-card">
          <div class="chart-head">
            <div class="chart-title" data-i18n="chartLatency">Latency trend</div>
            <div class="chart-sub" data-i18n="chartLatencySub">last 50 decisions · ms</div>
          </div>
          <svg class="chart-svg" id="chart-latency" viewBox="0 0 400 190" preserveAspectRatio="none"></svg>
          <div class="chart-legend"><span><span class="dot lat"></span><span data-i18n="legendJevLatency">JEV latency</span></span></div>
        </div>
        <div class="chart-card">
          <div class="chart-head">
            <div class="chart-title" data-i18n="chartTokensFeature">Tokens by feature</div>
            <div class="chart-sub" data-i18n="chartTokensFeatureSub">cumulative saved</div>
          </div>
          <svg class="chart-svg" id="chart-features" viewBox="0 0 400 190" preserveAspectRatio="none"></svg>
          <div class="chart-legend"><span><span class="dot tok"></span><span data-i18n="legendTokensSaved">tokens saved</span></span></div>
        </div>
      </div>

      <div class="charts-row">
        <div class="chart-card">
          <div class="chart-head">
            <div class="chart-title" data-i18n="chartRequestsProject">Requests by project</div>
            <div class="chart-sub" data-i18n="chartRequestsProjectSub">decisions evaluated</div>
          </div>
          <svg class="chart-svg" id="chart-projects-req" viewBox="0 0 400 200" preserveAspectRatio="none"></svg>
          <div class="chart-legend"><span><span class="dot lat"></span><span data-i18n="legendDecisions">decisions</span></span></div>
        </div>
        <div class="chart-card">
          <div class="chart-head">
            <div class="chart-title" data-i18n="chartTokensProject">Tokens saved by project</div>
            <div class="chart-sub" data-i18n="chartTokensProjectSub">cumulative per project</div>
          </div>
          <svg class="chart-svg" id="chart-projects-tok" viewBox="0 0 400 200" preserveAspectRatio="none"></svg>
          <div class="chart-legend"><span><span class="dot tok"></span><span data-i18n="legendTokensSaved">tokens saved</span></span></div>
        </div>
      </div>

      <div class="section">
        <div class="section-head">
          <div class="section-title" data-i18n="secLiveStream">Live input stream</div>
          <div class="section-note" data-i18n="secLiveStreamNote">what JEV just evaluated — newest on top</div>
        </div>
        <div class="stream" id="stream-list"></div>
      </div>

      <div class="section">
        <div class="section-head">
          <div class="section-title" data-i18n="secSavings">Savings by hook and skill</div>
          <div class="section-note" data-i18n="secSavingsNote">tokens saved and latency per feature</div>
        </div>
        <div class="grid" id="breakdown-container"></div>
      </div>

      <div class="section">
        <div class="section-head">
          <div class="section-title" data-i18n="secLatest">Latest decisions</div>
          <div class="section-note">the 20 most recent</div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th data-i18n="tblTime">Time</th>
                <th data-i18n="tblFeature">Feature / Hook</th>
                <th data-i18n="tblLatency">JEV latency</th>
                <th data-i18n="tblTokensSaved">Tokens saved</th>
                <th data-i18n="tblStatus">Status</th>
              </tr>
            </thead>
            <tbody id="entries-body"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- VIEW: Hooks & Skills (config) -->
    <div id="view-config" style="display:none;">
      <div class="section">
        <div class="section-head">
          <div class="section-title">Hooks</div>
          <div class="section-note">toggle on/off and tune thresholds · saved to ~/.jev/config.json</div>
        </div>
        <div id="config-hooks"></div>

        <div class="section-head" style="margin-top:22px;">
          <div class="section-title">Skills</div>
          <div class="section-note">on/off and parameters</div>
        </div>
        <div id="config-skills"></div>

        <div class="config-actions">
          <button class="btn btn-primary" onclick="saveConfig()" data-i18n="save">Save</button>
          <button class="btn" onclick="resetConfig()">Reset to defaults</button>
          <span class="save-msg" id="save-msg"></span>
        </div>
      </div>
    </div>

    <!-- VIEW: Settings (pricing & balance) -->
    <div id="view-settings" style="display:none;">
      <div class="section">
        <div class="section-head">
          <div class="section-title">Pricing &amp; balance</div>
          <div class="section-note">cost per 1M tokens + initial credit · remaining computed live</div>
        </div>

        <div class="cfg-item">
          <div class="cfg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></div>
          <div class="cfg-meta">
            <div class="cfg-name">JEV API key</div>
            <div class="cfg-desc">TypeSafe System One · used when no JEV_API_KEY env is set</div>
          </div>
          <div class="cfg-controls">
            <label class="cfg-field"><input type="text" id="cfg-api-key" placeholder="apikey_..." style="width:220px" autocomplete="off" spellcheck="false"></label>
            <button class="btn" type="button" onclick="toggleApiKey()" title="Show / hide">Reveal</button>
          </div>
        </div>

        <div class="cfg-item">
          <div class="cfg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M8.5 9h5a2 2 0 0 1 0 4h-3a2 2 0 0 0 0 4h5"/></svg></div>
          <div class="cfg-meta">
            <div class="cfg-name">Price per million input</div>
            <div class="cfg-desc">USD · default $0.04 (JEV System One). Adjust if the rate changes.</div>
          </div>
          <div class="cfg-controls">
            <label class="cfg-field">USD / M<input type="number" step="0.001" min="0" id="cfg-price-per-m" value="0.04"></label>
          </div>
        </div>
        <div class="cfg-item">
          <div class="cfg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 18V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M12 8v8M8.5 10h4a1.8 1.8 0 0 1 0 3.6H9.5a1.8 1.8 0 0 0 0 3.6h4"/></svg></div>
          <div class="cfg-meta">
            <div class="cfg-name">Initial balance</div>
            <div class="cfg-desc">USD · credit you started with (e.g. $5). Used to compute remaining balance.</div>
          </div>
          <div class="cfg-controls">
            <label class="cfg-field">USD<input type="number" step="0.01" min="0" id="cfg-initial-balance" value="5"></label>
          </div>
        </div>
        <div class="cfg-item">
          <div class="cfg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="4"/></svg></div>
          <div class="cfg-meta">
            <div class="cfg-name">Remaining balance</div>
            <div class="cfg-desc">initial − real JEV spend so far</div>
          </div>
          <div class="cfg-controls">
            <label class="cfg-field" id="cfg-remaining-balance" style="font-size:13px; color:var(--good); font-weight:600;">…</label>
          </div>
        </div>

        <div class="section-head" style="margin-top:22px;">
          <div class="section-title">Features</div>
          <div class="section-note">toggle JEV routing behaviors on/off</div>
        </div>
        <div id="router-features"></div>

        <div class="config-actions">
          <button class="btn btn-primary" onclick="saveConfig()" data-i18n="save">Save</button>
          <button class="btn" onclick="resetConfig()">Reset to defaults</button>
          <span class="save-msg" id="save-msg"></span>
        </div>
      </div>
    </div>

    <!-- VIEW: Guardrails -->
    <div id="view-guardrails" style="display:none;">
      <div class="section">
        <div class="section-head">
          <div class="section-title">Guardrails</div>
          <div class="section-note">what JEV blocks vs. only warns about</div>
        </div>
        <div id="guardrails-hooks"></div>
        <div id="guardrails-skills"></div>

        <div class="config-actions">
          <button class="btn btn-primary" onclick="saveConfig()" data-i18n="save">Save</button>
          <button class="btn" onclick="resetConfig()">Reset to defaults</button>
          <span class="save-msg" id="save-msg"></span>
        </div>
      </div>
    </div>

    <!-- VIEW: 9Router (model routing) -->
    <div id="view-router" style="display:none;">
      <div class="section">
        <div class="section-head">
          <div class="section-title">9Router</div>
          <div class="section-note">model profiling, combo suggestion and task routing · connect any 9Router</div>
        </div>

        <div class="cfg-item">
          <div class="cfg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18"/></svg></div>
          <div class="cfg-meta">
            <div class="cfg-name">Base URL</div>
            <div class="cfg-desc">9Router gateway endpoint</div>
          </div>
          <div class="cfg-controls">
            <label class="cfg-field"><input type="text" id="cfg-router-url" value="http://localhost:20128" style="width:220px"></label>
          </div>
        </div>
        <div class="cfg-item">
          <div class="cfg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></div>
          <div class="cfg-meta">
            <div class="cfg-name">API key</div>
            <div class="cfg-desc">gateway token · masked in the UI</div>
          </div>
          <div class="cfg-controls">
            <label class="cfg-field"><input type="text" id="cfg-router-key" placeholder="sk-..." style="width:220px" autocomplete="off" spellcheck="false"></label>
            <button class="btn" type="button" onclick="toggleRouterKey()">Reveal</button>
          </div>
        </div>

        <div class="section-head" style="margin-top:22px;">
          <div class="section-title">Model profiler</div>
          <div class="section-note">classify every model and build combos with failover</div>
        </div>
        <div class="config-actions">
          <button class="btn btn-primary" onclick="runProfiler()" data-i18n="runProfiler">Run profiler</button>
          <span class="save-msg" id="profiler-msg"></span>
        </div>
        <div id="router-combos" style="margin-top:14px;"></div>

        <div class="config-actions">
          <button class="btn btn-primary" onclick="saveConfig()" data-i18n="save">Save</button>
          <button class="btn" onclick="testRouter()" data-i18n="testConnection">Test connection</button>
          <span class="save-msg" id="router-msg"></span>
        </div>
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
    const JEV_I18N = ${JSON.stringify(STRINGS)};
    let JEV_LANG = ${JSON.stringify(uiLang)};
    function i18nStr(key) { return (JEV_I18N[JEV_LANG] && JEV_I18N[JEV_LANG][key]) || JEV_I18N.en[key] || key; }
    function applyLang() {
      document.documentElement.lang = JEV_LANG;
      document.querySelectorAll('[data-i18n]').forEach(el => {
        el.innerText = i18nStr(el.dataset.i18n);
      });
      document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = i18nStr(el.dataset.i18nTitle);
      });
      document.querySelectorAll('[data-i18n-tooltip]').forEach(el => {
        el.setAttribute('title', i18nStr(el.dataset.i18nTooltip));
      });
      const sel = document.getElementById('lang-select');
      if (sel) sel.value = JEV_LANG;
      // re-render dynamic cards/charts (savings, table, bars) + view title
      if (typeof currentData !== 'undefined' && currentData && typeof render === 'function') {
        render(currentData);
      }
      const cur = new URLSearchParams(window.location.search).get('view') || 'telemetry';
      showView(cur);
    }
    async function setLang(lang) {
      if (!JEV_I18N[lang]) return;
      JEV_LANG = lang;
      try {
        await fetch('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ui: { lang } })
        });
      } catch (e) { /* fail-open */ }
      applyLang();
    }
    let currentData = ${JSON.stringify(initialData)};

    function featName(feat) {
      const key = 'feat_' + String(feat || 'unknown').replace(/-/g, '_');
      return i18nStr(key);
    }
    function i18nFmt(key, vars) {
      let out = String(i18nStr(key));
      for (const [k, v] of Object.entries(vars || {})) {
        out = out.split('{' + k + '}').join(v);
      }
      return out;
    }
    function fmtShort(n) {
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
      return String(n);
    }
    function fmtSec(s) {
      if (s >= 3600) return (s / 3600).toFixed(1) + 'h';
      if (s >= 60) return Math.floor(s / 60) + 'm';
      return Math.round(s) + 's';
    }

    function render(data) {
      document.getElementById('val-tokens').innerText = (data.total_tokens_saved || 0).toLocaleString('pt-BR');
      document.getElementById('val-cost').innerText = '$' + (data.total_cost_saved_usd || 0).toFixed(2);

      const sec = data.total_time_saved_sec || 0;
      document.getElementById('val-time').innerText = sec >= 60
        ? Math.floor(sec / 60) + ' min'
        : sec + ' s';

      document.getElementById('val-decisions').innerText = (data.total_decisions || 0).toLocaleString('pt-BR');
      document.getElementById('val-latency').innerText = (data.avg_jev_latency_ms || 0) + ' ms';
      const reqEl = document.getElementById('val-requests');
      if (reqEl) reqEl.innerText = (data.total_decisions || 0).toLocaleString('pt-BR');
      const jiEl = document.getElementById('val-jevinput');
      if (jiEl) jiEl.innerText = (data.total_jev_input_tokens || 0).toLocaleString('pt-BR');
      document.getElementById('val-jevcost').innerText = '$' + (data.total_jev_cost_usd || 0).toFixed(4);
      const balEl = document.getElementById('val-jevbalance');
      if (balEl) {
        const initial = Number(jevConfig?.pricing?.initial_balance_usd) || 5;
        const remaining = initial - (data.total_jev_cost_usd || 0);
        balEl.innerText = (remaining < 0 ? '-$' + Math.abs(remaining).toFixed(2) : '$' + remaining.toFixed(2));
        balEl.style.color = remaining < 0 ? 'var(--bad)' : 'var(--good)';
      }

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
            <span class="card-title"><span class="dot" style="background:\${color}"></span>\${featName(feat)}</span>
            <span class="card-count">\${i18nFmt('count_calls', { count: info.count.toLocaleString('pt-BR') })}</span>
          </div>
          <div class="card-bar"><div class="fill" style="width:\${pct}%; background:\${color}"></div></div>
          <div class="card-stats">
            <div class="stat"><div class="k">\${i18nStr('statTokens')}</div><strong>\${fmtShort(info.tokens_saved)}</strong></div>
            <div class="stat"><div class="k">\${i18nStr('statAvg')}</div><strong>\${info.avg_latency_ms} ms</strong></div>
            <div class="stat"><div class="k">\${i18nStr('statTime')}</div><strong>\${fmtSec(info.time_saved_sec)}</strong></div>
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
          <td><span class="tag tag-feature">\${featName(entry.feature)}</span></td>
          <td>\${entry.jev_latency_ms || 0} ms</td>
          <td style="color: var(--good); font-weight: 600;">+\${(entry.estimated_llm_tokens_saved || 0).toLocaleString('pt-BR')}</td>
          <td><span class="tag tag-status">\${entry.status || 'success'}</span></td>
        \`;
        tbody.appendChild(tr);
      }

      renderLatencyChart(entries);
      renderFeatureBars(data.by_feature || {});
      renderProjectBars('chart-projects-req', data.by_project || {}, 'count');
      renderProjectBars('chart-projects-tok', data.by_project || {}, 'tokens_saved');
      renderStream(entries);
      updateRemainingBalance();
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
      el.title = itemTitle(e);
      el.innerHTML = '<span class="s-time">' + t + '</span>' +
        '<span class="s-feat">' + (e.feature || 'general') + '</span>' +
        '<span class="s-origin">' + originLabel(e) + '</span>' +
        typeBadgeHtml(e) + resultHtml(e) +
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
        html += '<div class="' + cls + '" title="' + itemTitle(e) + '">' +
          '<span class="s-time">' + t + '</span>' +
          '<span class="s-feat">' + (e.feature || 'general') + '</span>' +
          '<span class="s-origin">' + originLabel(e) + '</span>' +
          typeBadgeHtml(e) + resultHtml(e) +
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
    function typeBadgeHtml(e) {
      const t = e.answer_type || '';
      const label = { choice: 'Choice', noul: 'Noul', score: 'Score' }[t] || '';
      if (!label) return '';
      return '<span class="s-type t-' + t + '">' + label + '</span>';
    }
    function resultHtml(e) {
      const t = e.answer_type || '';
      const r = e.answer_result || '';
      if (!r) return '';
      let cls = '';
      if (t === 'noul') cls = r.startsWith('true') ? ' good' : ' bad';
      if (t === 'choice' && r.includes('none')) cls = ' bad';
      return '<span class="s-result' + cls + '">' + escapeHtml(r) + '</span>';
    }
    function escapeAttr(s) {
      return escapeHtml(String(s || ''));
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
      const full = e.origin_project ? String(e.origin_project) : '';
      return agentSvg(agent) + '<span title="' + escapeAttr(agentLabel(agent) + (full ? ' · ' + full : '')) + '">' + escapeHtml(agentLabel(agent)) + (proj ? ' · ' + escapeHtml(proj) : '') + '</span>';
    }
    function itemTitle(e) {
      const agent = e.origin_agent ? agentLabel(e.origin_agent) : 'CLI';
      const proj = e.origin_project ? String(e.origin_project) : '';
      const txt = e.input_preview || (e.feature || 'general') + ' evaluation';
      return escapeAttr([agent, proj, txt].filter(Boolean).join(' · '));
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
        out += '<text class="axis-label" x="' + pad + '" y="' + (y + barH - 4) + '">' + truncate(featName(name), 14) + '</text>' +
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

    // --- Single-metric bars per project (requests or tokens) ---
    function renderProjectBars(svgId, byProject, metric) {
      const svg = document.getElementById(svgId);
      if (!svg) return;
      const W = 400, H = 200, pad = 8, barH = 16, gap = 18;
      const projects = Object.entries(byProject || {})
        .sort((a, b) => b[1][metric] - a[1][metric])
        .slice(0, 8);
      if (projects.length === 0) { svg.innerHTML = ''; return; }

      const max = Math.max(...projects.map(([, p]) => p[metric]), 1);
      const labelW = 110, barMax = W - pad - labelW - pad - 40;
      const fill = metric === 'count' ? 'var(--accent)' : 'var(--good)';
      let out = '';
      projects.forEach(([name, p], i) => {
        const y = pad + i * gap + 4;
        const w = Math.max(3, (p[metric] / max) * barMax);
        out += '<text class="axis-label" x="' + pad + '" y="' + (y + barH - 4) + '">' + truncate(name, 18) + '</text>' +
          '<rect class="bar" style="fill:' + fill + '" x="' + (pad + labelW) + '" y="' + y + '" width="' + w.toFixed(1) + '" height="' + barH + '" rx="3"/>' +
          '<text class="axis-label" x="' + (pad + labelW + barMax + 6) + '" y="' + (y + barH - 4) + '">' + (metric === 'count' ? p.count : fmtShort(p.tokens_saved)) + '</text>';
      });
      svg.innerHTML = out;
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

    // --- Hooks & Skills config UI ---
    const HOOK_META = {
      'jev-rule-guard': {
        name: 'Rule Guard', desc: 'block edits that violate project rules or break contracts',
        tip: 'Runs before every file write/edit (PreToolUse). JEV checks the proposed change against project rules, public contracts and existing logic. If a violation is detected above the confidence threshold, the edit is blocked (exit code 2) and a reason is shown. Fail-open: if JEV errors, the edit proceeds.',
        fields: [['confidence_threshold', 0.80], ['block_contract_break', true], ['block_logic_weakening', true]]
      },
      'jev-skill-picker': {
        name: 'Skill Picker', desc: 'route prompts to the best skill',
        tip: 'Runs on every prompt (UserPromptSubmit). Scans installed skills and asks JEV which single skill best matches the request. On a confident match it injects a routing directive so only that skill is loaded — saving thousands of tokens per prompt instead of loading all skill definitions.',
        fields: [['confidence_threshold', 0.50], ['min_skills', 5]]
      },
      'jev-fast-compact': {
        name: 'Fast Compaction', desc: 'guide context compaction',
        tip: 'Runs before context compaction (PreCompact) when the conversation exceeds the usage threshold. JEV decides whether the history holds critical content (decisions, rules, diffs) and returns custom instructions that tell the summarizer what to preserve. Below the threshold it stays silent.',
        fields: [['usage_threshold', 25]]
      },
      'jev-test-verifier': {
        name: 'Test Verifier', desc: 'flag control files without test coverage',
        tip: 'Runs after file edits (PostToolUse) on control-domain files (auth, roles, permissions, billing...). JEV checks whether the modified rules have corresponding automated tests. When coverage is missing it warns in the TUI and injects a note so the agent can add tests. Fail-open on error.',
        fields: [['control_file_pattern', 'regex']]
      }
    };
    const SKILL_META = {
      'jev-discover': {
        name: 'Discover', desc: 'hybrid discovery (graph + search + JEV)',
        tip: '4-stage pipeline before reading code: Graphify (knowledge graph) → GrepAI (semantic search) → JEV (scores candidates 1–10 in <200ms) → Claude reads only the top 2–3 files. Use for "where is X implemented?" questions without opening dozens of files.',
        fields: [['top_files', 3]]
      },
      'jev-explore': {
        name: 'Explore', desc: 'score files and pick top relevant',
        tip: 'Collects candidate files, scores them in batches of 20 via JEV, and returns only the top N most relevant. Prevents context waste from opening many files when searching for a concept.',
        fields: [['batch_size', 20], ['top_files', 3]]
      },
      'jev-review': {
        name: 'Review', desc: '7-question review pre-filter',
        tip: 'Runs the git diff against 7 binary questions: architecture violation, security/auth change, breaking API, DB migration risk, secret exposure, high complexity, missing tests. If all are NO → fast PASS in ~200ms with zero LLM tokens. If any is YES → escalates to deep review with focus points.',
        fields: [['confidence_threshold', 0.50]]
      },
      'jev-anti-regression': {
        name: 'Anti-Regression', desc: 'detect regression risk in diffs',
        tip: 'Analyzes the diff for functional regressions: broken public signatures, deleted/weakened business logic, tests weakened to force the pipeline green, hidden side effects on shared state. A second set of deterministic eyes on code that "was already working".',
        fields: [['confidence_threshold', 0.75]]
      },
      'jev-plan-evaluator': {
        name: 'Plan Evaluator', desc: 'validate bugfix plans',
        tip: 'Before writing code, JEV evaluates the proposed plan against the reported problem: does it fix the root cause or just mask the symptom? Returns a verdict (optimal / symptom-patch / high-regression-risk / ineffective), root-cause coverage and a technical solidity score.',
        fields: [['min_score', 2.5]]
      },
      'jev-browser-test': {
        name: 'Browser Test', desc: 'autonomous browser UI testing',
        tip: 'Drives autonomous browser navigation: extracts visible interactive elements and JEV picks the next click/action in ~200ms via the choice primitive. Includes jev_click_goal (autonomous loop), jev_decide_click (single step) and jev_verify_page (semantic verification). Cuts test cycles from ~40s to ~4s.',
        fields: [['max_steps', 10]]
      }
    };
    const GUARD_GR_META = {
      name: 'Rule Guard', desc: 'what JEV blocks before a file write/edit',
      tip: 'Runs before every file write/edit (PreToolUse). Each rule can be toggled independently: rule violations, public contract breaks, and weakened existing logic. All three respect the shared confidence threshold.',
      fields: [['block_rule_violation', true], ['block_contract_break', true], ['block_logic_weakening', true], ['confidence_threshold', 0.80]]
    };
    const GUARD_TV_META = {
      name: 'Test Verifier', desc: 'test coverage alerting on control files',
      tip: 'Runs after edits on control-domain files (auth, roles, permissions, billing...). When coverage is missing it warns in the TUI unless the warning is disabled.',
      fields: [['warn_on_missing_tests', true], ['control_file_pattern', 'regex']]
    };
    const GUARD_AR_META = {
      name: 'Anti-Regression', desc: 'regression risk on diffs',
      tip: 'Analyzes the diff for regressions: broken public signatures, deleted/weakened logic, weakened tests, shared-state side effects. Signals above the severity threshold are surfaced.',
      fields: [['min_severity', 'medium'], ['confidence_threshold', 0.75]]
    };
    const FIELD_LABELS = {
      confidence_threshold: 'Min confidence',
      block_rule_violation: 'Block rule violation',
      block_contract_break: 'Block contract break',
      block_logic_weakening: 'Block logic weakening',
      warn_on_missing_tests: 'Warn on missing tests',
      min_severity: 'Min severity',
      min_skills: 'Min skills',
      usage_threshold: 'Usage %',
      control_file_pattern: 'Control pattern',
      top_files: 'Top files',
      batch_size: 'Batch size',
      min_score: 'Min score',
      max_steps: 'Max steps'
    };
    const CFG_ICONS = {
      // hooks
      'jev-rule-guard': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
      'jev-skill-picker': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>',
      'jev-fast-compact': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><circle cx="12" cy="12" r="3.5"/></svg>',
      'jev-test-verifier': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h10M4 17h7"/><circle cx="18" cy="17" r="3"/><path d="M18 15v2l1.5 1.5"/></svg>',
      // skills
      'jev-discover': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M15.5 15.5l4 4"/></svg>',
      'jev-explore': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h18M3 12h18M3 17h12"/><path d="M17 14l3 3-3 3"/></svg>',
      'jev-review': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10H7a3 3 0 0 0-3 3z"/><path d="M8 8h8M8 11h8M8 14h4"/></svg>',
      'jev-anti-regression': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M12 3L8 7M12 3l4 4"/><path d="M5 14v3a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-3"/></svg>',
      'jev-plan-evaluator': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6M10 3v4a2 2 0 0 0 4 0V3"/><path d="M5 21h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z"/><path d="M9 14h6M12 11v6"/></svg>',
      'jev-browser-test': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M3 8h18M8 21h8M12 17v4"/><circle cx="7" cy="12.5" r="0.6" fill="currentColor"/></svg>'
    };
    let jevConfig = {};

    function fieldLabel(f) {
      return FIELD_LABELS[f] || f.replace(/_/g, ' ');
    }
    function cfgItemBody(kind, name, meta, enabled) {
      const fields = (meta.fields || []).map(([f, defaultVal]) => {
        const v = jevConfig[kind]?.[name]?.[f];
        const val = v === undefined ? defaultVal : v;
        if (f === 'min_severity') {
          return '<label class="cfg-field">' + fieldLabel(f) +
            '<select data-kind="' + kind + '" data-name="' + name + '" data-field="' + f + '">' +
            ['low', 'medium', 'high', 'critical'].map(o => '<option value="' + o + '"' + (val === o ? ' selected' : '') + '>' + o + '</option>').join('') +
            '</select></label>';
        }
        if (typeof defaultVal === 'string' || f === 'control_file_pattern') {
          return '<label class="cfg-field">' + fieldLabel(f) +
            '<input type="text" data-kind="' + kind + '" data-name="' + name + '" data-field="' + f + '" value="' + escapeAttr(val) + '" style="width:150px"></label>';
        }
        if (typeof defaultVal === 'boolean') {
          return '<label class="cfg-field">' + fieldLabel(f) +
            '<input type="checkbox" data-kind="' + kind + '" data-name="' + name + '" data-field="' + f + '" ' + (val ? 'checked' : '') + '></label>';
        }
        return '<label class="cfg-field">' + fieldLabel(f) +
          '<input type="number" step="any" data-kind="' + kind + '" data-name="' + name + '" data-field="' + f + '" value="' + val + '"></label>';
      }).join('');
      const icon = CFG_ICONS[name] || '';
      return '<div class="cfg-icon">' + icon + '</div>' +
        '<div class="cfg-meta"><div class="cfg-name">' + meta.name +
        '<button class="cfg-info" type="button" aria-label="How this works" data-tip="' + escapeAttr(meta.tip) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1.5 1-1.5 2v.7"/><circle cx="11.5" cy="17" r="0.4" fill="currentColor"/></svg></button>' +
        '</div><div class="cfg-desc">' + meta.desc + '</div></div>' +
        '<div class="cfg-controls">' + fields +
        '<label class="toggle" title="Enable / disable"><input type="checkbox" data-kind="' + kind + '" data-name="' + name + '" data-field="enabled" ' + (enabled ? 'checked' : '') + '><span class="slider"></span></label>' +
        '</div>';
    }
    function cfgItemHTML(kind, name, meta, enabled) {
      return '<div class="cfg-item">' + cfgItemBody(kind, name, meta, enabled) + '</div>';
    }

    function renderConfig() {
      const hooks = document.getElementById('config-hooks');
      const skills = document.getElementById('config-skills');
      const grHooks = document.getElementById('guardrails-hooks');
      const grSkills = document.getElementById('guardrails-skills');
      hooks.innerHTML = Object.entries(HOOK_META).map(([n, m]) => cfgItemHTML('hooks', n, m, jevConfig.hooks?.[n]?.enabled !== false)).join('');
      skills.innerHTML = Object.entries(SKILL_META).map(([n, m]) => cfgItemHTML('skills', n, m, jevConfig.skills?.[n]?.enabled !== false)).join('');
      if (grHooks) {
        grHooks.innerHTML = '<div class="cfg-item">' + cfgItemBody('hooks', 'jev-rule-guard', GUARD_GR_META, jevConfig.hooks?.['jev-rule-guard']?.enabled !== false) + '</div>' +
          '<div class="cfg-item">' + cfgItemBody('hooks', 'jev-test-verifier', GUARD_TV_META, jevConfig.hooks?.['jev-test-verifier']?.enabled !== false) + '</div>';
      }
      if (grSkills) {
        grSkills.innerHTML = '<div class="cfg-item">' + cfgItemBody('skills', 'jev-anti-regression', GUARD_AR_META, jevConfig.skills?.['jev-anti-regression']?.enabled !== false) + '</div>';
      }

      // 9Router view
      const rUrl = document.getElementById('cfg-router-url');
      const rKey = document.getElementById('cfg-router-key');
      if (rUrl) rUrl.value = jevConfig?.router?.base_url || 'http://localhost:20128';
      if (rKey) { fullRouterKey = jevConfig?.router?.api_key || gatewayToken() || ''; maskRouterKeyInput(); syncRouterKeyOnInput(); }
      renderRouterCombos(jevConfig?.router?.suggested_combos || []);
      const rf = document.getElementById('router-features');
      if (rf) {
        const features = [
          ['model_profiler', 'featProfiler', 'featProfilerDesc', 'tipProfiler'],
          ['combo_suggester', 'featCombos', 'featCombosDesc', 'tipCombos'],
          ['task_router', 'featTaskRouter', 'featTaskRouterDesc', 'tipTaskRouter'],
          ['subagent_router', 'featSubagent', 'featSubagentDesc', 'tipSubagent'],
          ['project_profile', 'featProfile', 'featProfileDesc', 'tipProfile']
        ];
        rf.innerHTML = features.map(([f, nameKey, descKey, tipKey]) => {
          const on = jevConfig?.router?.[f] !== false;
          return '<div class="cfg-item" data-i18n-tooltip="' + tipKey + '" title="' + i18nStr(tipKey) + '">' +
            '<div class="cfg-meta"><div class="cfg-name">' + i18nStr(nameKey) + '</div><div class="cfg-desc">' + i18nStr(descKey) + '</div></div>' +
            '<div class="cfg-controls"><label class="toggle" title="' + i18nStr(tipKey) + '"><input type="checkbox" data-router="' + f + '" ' + (on ? 'checked' : '') + '><span class="slider"></span></label></div>' +
            '</div>';
        }).join('');
      }

      const price = jevConfig?.pricing?.price_per_million_input;
      const bal = jevConfig?.pricing?.initial_balance_usd;
      const p = document.getElementById('cfg-price-per-m');
      const b = document.getElementById('cfg-initial-balance');
      const key = document.getElementById('cfg-api-key');
      if (p) p.value = price !== undefined ? price : 0.04;
      if (b) b.value = bal !== undefined ? bal : 5;
      if (key) {
        fullApiKey = jevConfig?.jev?.api_key || envKey() || '';
        key.value = fullApiKey;
        maskApiKeyInput();
        syncApiKeyOnInput();
      }
      updateRemainingBalance();
    }

    function updateRemainingBalance() {
      const el = document.getElementById('cfg-remaining-balance');
      if (!el) return;
      const initial = Number(document.getElementById('cfg-initial-balance').value) || 0;
      const spent = currentData.total_jev_cost_usd || 0;
      const remaining = initial - spent;
      el.innerText = '$' + remaining.toFixed(4);
      el.style.color = remaining < 0 ? 'var(--bad)' : 'var(--good)';
      if (remaining < 0) el.innerText = 'exceeded by $' + Math.abs(remaining).toFixed(4);
    }

    async function initConfig() {
      try {
        const res = await fetch('/api/config');
        jevConfig = await res.json();
        renderConfig();
      } catch (e) { console.error('config load failed', e); }
    }

    // SPA view switching via sidebar, synced to ?view=<name> query param
    const VIEWS = {
      telemetry: { titleKey: 'titleTelemetry', crumbKey: 'crumbTelemetry', refresh: true },
      config: { titleKey: 'titleConfig', crumbKey: 'crumbConfig', refresh: false },
      guardrails: { titleKey: 'titleGuardrails', crumbKey: 'crumbGuardrails', refresh: false },
      router: { titleKey: 'titleRouter', crumbKey: 'crumbRouter', refresh: false },
      settings: { titleKey: 'titleSettings', crumbKey: 'crumbSettings', refresh: false }
    };
    function viewFromQuery() {
      const p = new URLSearchParams(window.location.search).get('view');
      return VIEWS[p] ? p : 'telemetry';
    }
    function showView(name) {
      if (!VIEWS[name]) name = 'telemetry';
      ['telemetry', 'config', 'guardrails', 'router', 'settings'].forEach(v => {
        document.getElementById('view-' + v).style.display = (v === name) ? '' : 'none';
      });
      document.getElementById('page-title').innerText = i18nStr(VIEWS[name].titleKey);
      document.getElementById('page-crumb').innerText = i18nStr(VIEWS[name].crumbKey);
      document.getElementById('refresh-btn').style.display = VIEWS[name].refresh ? '' : 'none';
      document.querySelectorAll('.nav-item').forEach(a => {
        a.classList.toggle('active', a.dataset.view === name);
      });
      // keep the address bar in sync (replaceState, no page reload)
      if (name === 'telemetry') {
        history.replaceState(null, '', window.location.pathname);
      } else {
        history.replaceState(null, '', window.location.pathname + '?view=' + name);
      }
    }
    window.addEventListener('popstate', () => showView(viewFromQuery()));

    function collectConfig() {
      const out = { hooks: {}, skills: {}, pricing: {}, jev: {}
      };
      // Only read inputs from the currently visible view to avoid
      // duplicated fields (rule-guard/test-verifier appear in both
      // Hooks&Skills and Guardrails).
      const visible = ['view-config', 'view-guardrails', 'view-settings'].find(id => {
        const el = document.getElementById(id);
        return el && getComputedStyle(el).display !== 'none';
      }) || 'view-config';
      document.querySelectorAll('#' + visible + ' [data-kind][data-name]').forEach(inp => {
        const kind = inp.dataset.kind, name = inp.dataset.name, field = inp.dataset.field;
        out[kind][name] = out[kind][name] || {};
        if (inp.type === 'checkbox') out[kind][name][field] = inp.checked;
        else if (inp.tagName === 'SELECT') out[kind][name][field] = inp.value;
        else if (inp.type === 'text') out[kind][name][field] = inp.value;
        else out[kind][name][field] = Number(inp.value);
      });
      const price = document.getElementById('cfg-price-per-m');
      const bal = document.getElementById('cfg-initial-balance');
      const key = document.getElementById('cfg-api-key');
      if (price) out.pricing.price_per_million_input = Number(price.value) || 0.04;
      if (bal) out.pricing.initial_balance_usd = Number(bal.value) || 0;
      // use the unmasked value (input may be visually masked)
      if (key) out.jev.api_key = (typeof fullApiKey === 'string' ? fullApiKey : key.value).trim();

      // 9Router settings
      const rUrl = document.getElementById('cfg-router-url');
      const rKey = document.getElementById('cfg-router-key');
      out.router = {};
      if (rUrl) out.router.base_url = rUrl.value.trim();
      if (rKey) {
        // prefer the typed value (Revealed or freshly typed) over the masked snapshot
        out.router.api_key = (rKey.dataset.revealed === '1' ? rKey.value : (fullRouterKey || rKey.value)).trim();
      }
      document.querySelectorAll('#view-router input[data-router]').forEach(inp => {
        out.router[inp.dataset.router] = inp.checked;
      });
      // preserve router fields the form does not edit (profiler output,
      // task→combo map) — otherwise Save wipes them (deepMerge drops them).
      const prevRouter = jevConfig?.router || {};
      if (Array.isArray(prevRouter.suggested_combos) && prevRouter.suggested_combos.length) {
        out.router.suggested_combos = prevRouter.suggested_combos;
      }
      if (prevRouter.task_combos && typeof prevRouter.task_combos === 'object') {
        out.router.task_combos = prevRouter.task_combos;
      }
      return out;
    }

    function toggleApiKey() {
      const k = document.getElementById('cfg-api-key');
      const btn = document.querySelector('#view-settings button[onclick="toggleApiKey()"]');
      if (!k) return;
      const revealed = k.dataset.revealed === '1';
      if (revealed) {
        // hide: mask it back
        k.dataset.revealed = '0';
        maskApiKeyInput();
        if (btn) btn.innerText = 'Reveal';
      } else {
        // reveal: show full value
        k.dataset.revealed = '1';
        k.value = fullApiKey || '';
        if (btn) btn.innerText = 'Hide';
      }
    }

    let fullApiKey = '';
    function maskApiKeyInput() {
      const k = document.getElementById('cfg-api-key');
      if (!k) return;
      k.dataset.revealed = '0';
      const v = fullApiKey || '';
      if (v.length > 12) k.value = v.slice(0, 12) + '…';
      else if (v) k.value = '••••' + v.slice(-4);
      else k.value = '';
    }
    function syncApiKeyOnInput() {
      const k = document.getElementById('cfg-api-key');
      if (!k) return;
      k.addEventListener('input', () => {
        const typed = k.value;
        if (typed && typed.includes('…')) return;
        if (typed === '••••' + fullApiKey.slice(-4)) return;
        fullApiKey = typed;
      });
    }

    let fullRouterKey = '';
    function maskRouterKeyInput() {
      const k = document.getElementById('cfg-router-key');
      if (!k) return;
      // mask from fullRouterKey; do NOT clobber it with the (possibly
      // empty) input value, otherwise a key loaded from config disappears.
      k.dataset.revealed = '0';
      const v = fullRouterKey || '';
      if (v.length > 12) k.value = v.slice(0, 12) + '…';
      else if (v) k.value = '••••' + v.slice(-4);
      else k.value = '';
    }
    function syncRouterKeyOnInput() {
      const k = document.getElementById('cfg-router-key');
      if (!k) return;
      // Keep the full key in sync when the user types (even masked),
      // so Save persists the real value, not the masked snapshot.
      k.addEventListener('input', () => {
        const typed = k.value;
        if (typed && typed.includes('…')) return; // still showing masked snapshot
        if (typed === '••••' + fullRouterKey.slice(-4)) return; // partial mask, skip
        fullRouterKey = typed;
      });
    }
    function toggleRouterKey() {
      const k = document.getElementById('cfg-router-key');
      const btn = document.querySelector('#view-router button[onclick="toggleRouterKey()"]');
      if (!k) return;
      if (k.dataset.revealed === '1') {
        k.dataset.revealed = '0';
        maskRouterKeyInput();
        if (btn) btn.innerText = 'Reveal';
      } else {
        k.dataset.revealed = '1';
        k.value = fullRouterKey || '';
        if (btn) btn.innerText = 'Hide';
      }
    }
    async function testRouter() {
      const msg = document.getElementById('router-msg');
      const url = document.getElementById('cfg-router-url').value.trim();
      const key = document.getElementById('cfg-router-key') ? fullRouterKey || document.getElementById('cfg-router-key').value : '';
      msg.innerText = 'Testing…';
      try {
        // route through the server (browser fetch to the 9Router is CORS-blocked)
        const res = await fetch('/api/router/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseUrl: url, apiKey: key })
        });
        const data = await res.json();
        if (!data.success) { msg.className = 'save-msg err'; msg.innerText = data.error || 'failed'; return; }
        msg.className = 'save-msg';
        msg.innerText = 'OK — ' + data.count + ' models';
      } catch (e) {
        msg.className = 'save-msg err';
        msg.innerText = 'Connection failed: ' + (e.message || e);
      }
    }
    async function runProfiler() {
      const msg = document.getElementById('profiler-msg');
      const box = document.getElementById('router-combos');
      if (msg) { msg.className = 'save-msg'; msg.innerText = 'Profiling…'; }
      if (box) box.innerHTML = '<div class="cfg-desc">rodando JEV sobre o catálogo…</div>';
      try {
        const res = await fetch('/api/router/profile', { method: 'POST' });
        const data = await res.json();
        if (!data.success) {
          if (msg) { msg.className = 'save-msg err'; msg.innerText = data.error || 'failed'; }
          return;
        }
        if (msg) msg.innerText = 'OK — ' + data.count + ' modelos, ' + data.combos.length + ' combos';
        renderRouterCombos(data.combos);
      } catch (e) {
        if (msg) { msg.className = 'save-msg err'; msg.innerText = String(e.message || e); }
      }
    }
    // --- per-task SVG marks for suggested combos ---
    const TASK_ICONS = {
      'planning_architecture': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9M12 9v12"/></svg>',
      'writing_code': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 9l-4 3 4 3M16 9l4 3-4 3M13 5l-2 14"/></svg>',
      'refactoring': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h6M14 12h6M14 8l4 4-4 4M10 8l-4 4 4 4"/></svg>',
      'tests': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h10M4 17h7"/><circle cx="18" cy="17" r="3"/><path d="M18 15v2l1.5 1.5"/></svg>',
      'docs': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h14a1 1 0 0 1 1 1v15H6a2 2 0 0 1-2-2z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
      'code_review': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10H7a3 3 0 0 0-3 3z"/><path d="M8 9h8M8 12h8M8 15h4"/></svg>',
      'debugging': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6M10 3v3a2 2 0 0 0 4 0V3"/><path d="M5 12h14"/><path d="M12 8v9"/><circle cx="12" cy="17" r="4"/><path d="M8.5 17h7"/></svg>',
      'data_analysis': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
      'creative_writing': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l2 4 4.5.5-3.5 3L16 15l-4-2-4 2 1-4.5-3.5-3L10 7z"/></svg>',
      'transcription': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
      'research': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>',
      'general': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M8.5 9h5a2 2 0 0 1 0 4h-3a2 2 0 0 0 0 4h5"/></svg>'
    };
    function taskIcon(task) {
      return TASK_ICONS[task] || TASK_ICONS.general;
    }
    function renderRouterCombos(combos) {
      const box = document.getElementById('router-combos');
      if (!box) return;
      if (!combos || combos.length === 0) {
        box.innerHTML = '<div class="cfg-desc">nenhum combo sugerido ainda — rode o profiler.</div>';
        return;
      }
      box.innerHTML = '<div class="group-label" style="margin:8px 0 10px;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-weight:600;">Suggested combos</div>' +
        combos.map(c => {
          const models = [c.primary, ...(c.failover || [])];
          return '<div class="cfg-item">' +
            '<div class="cfg-icon">' + taskIcon(c.task) + '</div>' +
            '<div class="cfg-meta"><div class="cfg-name">' + c.name + '</div>' +
            '<div class="cfg-desc">' + c.task.replace(/_/g, ' ') + '</div></div>' +
            '<div class="cfg-controls" style="flex-direction:column;align-items:flex-end;gap:4px;">' +
            models.map((m, i) => '<span class="s-result' + (i === 0 ? ' good' : '') + '" style="font-size:11px">' + (i === 0 ? '▶ ' : '↳ ') + escapeHtml(m) + '</span>').join('') +
            '</div></div>';
        }).join('');
    }

    async function saveConfig() {
      const msg = document.getElementById('save-msg');
      try {
        const res = await fetch('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(collectConfig())
        });
        const data = await res.json();
        msg.className = 'save-msg' + (data.success ? '' : ' err');
        msg.innerText = data.success ? 'Saved to ~/.jev/config.json' : data.error;
        if (data.success) { jevConfig = data.config; renderConfig(); }
      } catch (e) { msg.className = 'save-msg err'; msg.innerText = String(e.message || e); }
    }

    async function resetConfig() {
      const msg = document.getElementById('save-msg');
      try {
        const res = await fetch('/api/config/reset', { method: 'POST' });
        const data = await res.json();
        jevConfig = data.config;
        renderConfig();
        msg.className = 'save-msg';
        msg.innerText = 'Reset to defaults';
      } catch (e) { msg.className = 'save-msg err'; msg.innerText = String(e.message || e); }
    }

    render(currentData);
    setInterval(fetchData, 4000);
    initConfig();
    applyLang();
    showView(viewFromQuery());
  </script>
</body>
</html>`;
}

export function startDashboardServer(options = {}) {
  const port = options.port || 3838;
  const projectDir = options.projectDir || process.cwd();

  const server = http.createServer(async (req, res) => {
    const urlPath = (req.url || '').split('?')[0];

    if (urlPath === '/api/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const stats = readTelemetrySummary(projectDir);
      res.end(JSON.stringify(stats));
      return;
    }

    if (urlPath === '/api/config') {
      if (req.method === 'GET') {
        const cfg = loadConfig();
        // surface resolved keys (env / ~/.claude/settings.json) when the
        // stored config has none, so the Settings/9Router views show the
        // active key instead of a blank field. Not persisted.
        if (!cfg.jev?.api_key) cfg.jev = { ...(cfg.jev || {}), api_key: envKey() };
        if (!cfg.router?.api_key) cfg.router = { ...(cfg.router || {}), api_key: gatewayToken() };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(cfg));
        return;
      }
      if (req.method === 'PUT') {
        let body = '';
        req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
        req.on('end', () => {
          try {
            const patch = JSON.parse(body || '{}');
            // merge the patch over the CURRENT config (not defaults), so a
            // partial body (e.g. { ui: { lang } }) keeps router combos, keys,
            // hooks and skills intact.
            const cfg = deepMerge(loadConfig(), patch);
            const merged = saveConfig(cfg);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, config: merged }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
        return;
      }
    }

    if (urlPath === '/api/config/reset' && req.method === 'POST') {
      const merged = resetConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, config: merged }));
      return;
    }

    // Test 9Router connectivity server-side (browser fetch is CORS-blocked).
    if (urlPath === '/api/router/test' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        const { baseUrl, apiKey } = JSON.parse(body || '{}');
        const cfg = loadConfig();
        const url = (baseUrl || cfg.router?.base_url || 'http://localhost:20128').replace(/[\\/]+$/, '');
        const key = apiKey || cfg.router?.api_key || '';
        const upstream = await fetch(url + '/v1/models', { headers: { Authorization: 'Bearer ' + key } });
        if (!upstream.ok) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'HTTP ' + upstream.status }));
          return;
        }
        const data = await upstream.json();
        const n = (data?.data || []).length;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: n }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: String(e.message || e) }));
      }
      return;
    }

    // Run the JEV model profiler on the 9Router catalog and return the
    // suggested combos (persisted to config as router.suggested_combos).
    if (urlPath === '/api/router/profile' && req.method === 'POST') {
      try {
        const feats = routerFeatures();
        if (!feats.modelProfiler) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'model_profiler disabled in config' }));
          return;
        }
        const { real } = await listModels();
        const profiles = await profileModels(real);
        const combos = suggestCombos(profiles);
        // persist suggested combos
        const cfg = loadConfig();
        cfg.router = cfg.router || {};
        cfg.router.suggested_combos = combos;
        saveConfig(cfg);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, profiles, combos, count: real.length }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
      return;
    }

    if (urlPath === '/logo.png' && logoBuffer) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=300' });
      res.end(logoBuffer);
      return;
    }

    if (urlPath === '/' || urlPath === '/index.html') {
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