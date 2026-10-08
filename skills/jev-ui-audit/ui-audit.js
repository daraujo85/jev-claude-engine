#!/usr/bin/env node
/**
 * JEV UI Audit - Deterministic UI Quality Auditor
 * Detects layout, accessibility and performance issues.
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BrowserAdapter } from './browser/playwright-adapter.js';
import { runAnalyzers } from './analyzers/index.js';
import { discoverRoutesAdvanced } from './analyzers/route-discovery.js';
import { analyzeLighthouse } from './analyzers/lighthouse.js';
import { reportJSON, printSummary } from './reporters/json.js';

const DEFAULT_VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, touch: true },
  { name: 'tablet', width: 768, height: 1024, touch: true },
  { name: 'desktop', width: 1440, height: 900, touch: false }
];

const DEFAULT_CONFIG = {
  viewports: DEFAULT_VIEWPORTS,
  routes: null, // null = auto-discover
  lighthouse: true,
  accessibility: true,
  outputDir: '.jev/ui-audit'
};

function parseArgs(args) {
  const config = { ...DEFAULT_CONFIG };
  const urls = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('http')) {
      urls.push(arg);
    } else if (arg === '--routes' && args[i + 1]) {
      config.routes = args[++i].split(',');
    } else if (arg === '--viewports' && args[i + 1]) {
      const vpMap = { mobile: 0, tablet: 1, desktop: 2 };
      const names = args[++i].split(',');
      config.viewports = names.map(n => DEFAULT_VIEWPORTS[vpMap[n]] || DEFAULT_VIEWPORTS[2]);
    } else if (arg === '--json') {
      config.json = true;
    } else if (arg === '--gate') {
      config.gate = true;
    } else if (arg === '--no-lighthouse') {
      config.lighthouse = false;
    } else if (arg === '--no-a11y') {
      config.accessibility = false;
    } else if (arg === '--output' && args[i + 1]) {
      config.outputDir = args[++i];
    } else if (arg === '--login-url' && args[i + 1]) {
      config.loginUrl = args[++i];
    } else if (arg === '--username' && args[i + 1]) {
      config.username = args[++i];
    } else if (arg === '--password' && args[i + 1]) {
      config.password = args[++i];
    } else if (arg === '--cookie' && args[i + 1]) {
      config.cookie = args[++i];
    } else if (arg === '--config' && args[i + 1]) {
      const configFile = args[++i];
      const fileConfig = loadConfigFile(configFile);
      Object.assign(config, fileConfig);
    }
  }

  // Try to load .jev/ui-audit.json from current dir if no explicit config
  if (!config.configLoaded) {
    const localConfig = loadConfigFile('.jev/ui-audit.json');
    if (localConfig) {
      Object.assign(config, localConfig);
    }
  }

  return { urls, config };
}

function loadConfigFile(configPath) {
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      console.log(`Loaded config from: ${configPath}`);
      return { ...data, configLoaded: true };
    }
  } catch (err) {
    console.error(`Failed to load config from ${configPath}:`, err.message);
  }
  return null;
}

export function calculateScore(findings) {
  const penalties = {
    blocker: 25,
    critical: 15,
    high: 8,
    medium: 3,
    low: 1,
    info: 0
  };

  let score = 100;
  for (const f of findings) {
    score -= penalties[f.severity] || 0;
  }
  return Math.max(0, Math.min(100, score));
}

export function groupFindings(findings) {
  const bySeverity = {};
  const byCategory = {};

  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  }

  return { bySeverity, byCategory };
}

export async function auditUrl(url, config) {
  const browserOptions = {
    headless: true,
    loginUrl: config.loginUrl,
    username: config.username,
    password: config.password
  };
  const browser = new BrowserAdapter(browserOptions);
  const allFindings = [];
  const failures = [];
  const routes = config.routes ? [...config.routes] : ['/'];

  try {
    await browser.start();

    // Authenticate if credentials provided
    if (config.username && config.password && config.loginUrl) {
      await browser.authenticate(config.username, config.password, config.loginUrl);
    } else if (config.cookie) {
      // Parse cookie string (name=value; name2=value2)
      const cookies = config.cookie.split(';').map(c => {
        const [name, ...v] = c.split('=');
        return { name: name.trim(), value: v.join('=').trim(), domain: new URL(url).hostname };
      });
      await browser.setCookies(cookies);
    }

    // Auto-discover routes if not provided
    if (!config.routes) {
      await browser.open(url);
      // Determine project dir from URL or current directory
      const projectDir = process.cwd();
      const discovered = await discoverRoutesAdvanced({
        baseUrl: url,
        projectDir,
        config,
        page: browser.page
      });
      routes.push(...discovered);
    }

    // Audit each route
    for (const route of routes) {
      // Navigate to route
      // '/' é a própria URL auditada (que pode ter caminho, ex. /app/page.html)
      const fullUrl = route === '/' ? url
        : route.startsWith('http') ? route
        : new URL(route, url).href;
      await browser.open(fullUrl);

      await browser.waitForStableState();

      // Logado e a rota mostra form de senha: redirecionou pro login. Auditar
      // isso seria medir a tela de login com o nome de outra rota.
      if (browser.authenticated && await browser.isOnLoginForm()) {
        failures.push({
          analyzer: 'auth',
          route,
          viewport: '*',
          error: `rota redirecionou para o login (${browser.page.url()}); sessão perdida ou sem permissão`
        });
        continue;
      }

      // Audit each viewport
      for (const vp of config.viewports) {
        await browser.setViewport(vp.width, vp.height);
        await browser.waitForStableState();

        const context = {
          page: browser.page,
          route,
          viewport: vp,
          baseUrl: url,
          config
        };

        // Run analyzers
        const run = await runAnalyzers(context);
        allFindings.push(...run.findings);
        failures.push(...run.failures);

        // Run Lighthouse if enabled
        if (config.lighthouse) {
          const lighthouseFindings = await analyzeLighthouse(context);
          allFindings.push(...lighthouseFindings);
        }
      }
    }
  } finally {
    await browser.close();
  }

  return { findings: allFindings, failures, routes };
}

export function writeReport(results, outputDir) {
  const runDir = path.join(outputDir, results.runId);
  fs.mkdirSync(runDir, { recursive: true });
  const reportPath = path.join(runDir, 'report.json');
  reportJSON(results, { outputPath: reportPath });
  return reportPath;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
JEV UI Audit - Deterministic UI Quality Auditor

Usage: jev-ui-audit <url> [options]

Options:
  --routes <paths>     Comma-separated routes (default: auto-discover)
  --viewports <vps>   Comma-separated viewports: mobile,tablet,desktop
  --json               Output JSON format
  --gate               Exit with code 1 if score < 80
  --no-lighthouse      Disable Lighthouse analysis
  --no-a11y           Disable accessibility analysis
  --output <dir>      Output directory (default: .jev/ui-audit)
  --config <file>     Load config from file (.jev/ui-audit.json)

Route Discovery:
  Auto-discovers from: DOM links, sitemap.xml, framework route files
  Also reads .jev/ui-audit.json for explicit routes

Authentication:
  --login-url <url>   Login page URL
  --username <user>   Login username/email
  --password <pass>   Login password
  --cookie <string>    Session cookie (name=value;name2=value2)

Examples:
  jev-ui-audit http://localhost:4200
  jev-ui-audit http://localhost:4200 --routes /,/login,/dashboard
  jev-ui-audit http://localhost:4200 --viewports mobile,desktop --json
  jev-ui-audit https://app.com --login-url https://app.com/login --username user@email.com --password secret
  jev-ui-audit https://app.com --cookie "session=abc123;token=xyz789"
  jev-ui-audit https://app.com --config .jev/ui-audit.json
`);
    return;
  }

  const { urls, config } = parseArgs(args);

  if (urls.length === 0) {
    console.error('Error: URL required');
    process.exit(2);
  }

  const url = urls[0];
  console.log(`🔍 Auditing: ${url}`);

  const startTime = Date.now();
  const { findings, failures, routes } = await auditUrl(url, config);
  const duration = Date.now() - startTime;

  const score = calculateScore(findings);
  const { bySeverity, byCategory } = groupFindings(findings);

  const results = {
    runId: `ui-${Date.now()}`,
    timestamp: new Date().toISOString(),
    baseUrl: url,
    score,
    findings,
    bySeverity,
    byCategory,
    complete: failures.length === 0,
    failedAnalyzers: failures,
    routes,
    viewports: config.viewports.map(v => v.name),
    config: { ...config, password: config.password ? '***' : undefined, cookie: config.cookie ? '***' : undefined },
    durationMs: duration
  };

  const reportPath = writeReport(results, config.outputDir);

  // Output
  if (config.json) {
    console.log(reportJSON(results));
  } else {
    printSummary(results);
    console.log(`Report: ${reportPath}`);
  }

  // Exit code: audit incompleto nunca passa no gate
  if (config.gate && !results.complete) {
    console.log(`❌ Gate failed: ${failures.length} analyzer(s) falharam, audit incompleto`);
    process.exit(1);
  }
  if (config.gate && score < 80) {
    console.log(`❌ Gate failed: score ${score} < 80`);
    process.exit(1);
  }

  process.exit(0);
}

// Só roda a CLI quando executado direto (permite importar nos testes)
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(2);
  });
}
