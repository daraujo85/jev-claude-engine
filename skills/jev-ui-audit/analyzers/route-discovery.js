/**
 * Advanced Route Discovery
 * Supports: config file, framework files, sitemap.xml, DOM links
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Discover routes from multiple sources
 * @param {Object} options
 * @param {string} options.baseUrl - Base URL of the application
 * @param {string} options.projectDir - Project directory for scanning source files
 * @param {Object} options.config - Config object with routes
 * @param {Object} options.page - Playwright page object
 */
export async function discoverRoutesAdvanced({ baseUrl, projectDir, config, page }) {
  const routes = new Set();

  // 1. DOM links (highest priority if page provided)
  if (page) {
    const domRoutes = await discoverFromDOM(page);
    domRoutes.forEach(r => routes.add(r));
  }

  // 2. Config file (.jev/ui-audit.json)
  const configRoutes = await discoverFromConfig(projectDir);
  configRoutes.forEach(r => routes.add(r));

  // 3. Framework route files (only if no DOM routes found)
  if (routes.size === 0 && projectDir) {
    const frameworkRoutes = await discoverFromFrameworkFiles(projectDir);
    frameworkRoutes.forEach(r => routes.add(r));
  }

  // 4. Sitemap.xml (fallback)
  if (routes.size === 0 && baseUrl) {
    const sitemapRoutes = await discoverFromSitemap(baseUrl);
    sitemapRoutes.forEach(r => routes.add(r));
  }

  // Filter and return
  const filtered = Array.from(routes)
    .filter(r => r && r.length > 0 && r !== '/')
    .slice(0, config?.maxRoutes || 50);

  return filtered.length > 0 ? filtered : ['/'];
}

/**
 * Discover routes from config file
 */
async function discoverFromConfig(projectDir) {
  const routes = [];
  const configPaths = [
    path.join(projectDir || '.', '.jev', 'ui-audit.json'),
    path.join(projectDir || '.', 'ui-audit.config.json')
  ];

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (data.routes && Array.isArray(data.routes)) {
          routes.push(...data.routes);
        }
      }
    } catch {
      // ignore
    }
  }

  return routes;
}

/**
 * Discover routes from framework route files
 */
async function discoverFromFrameworkFiles(projectDir) {
  const routes = [];

  // Route file patterns for different frameworks
  const patterns = [
    // Angular
    'src/app/app.routes.ts',
    'src/app/app-routing.module.ts',
    'src/app/routes.ts',
    'src/routes.ts',
    // Vue
    'src/router/index.ts',
    'src/router/routes.ts',
    'src/router/routes.js',
    'src/routes.ts',
    'src/routes.js',
    // React
    'src/App.tsx',
    'src/App.jsx',
    'src/App.js',
    'src/routes.tsx',
    'src/routes.jsx',
    'src/routes.ts',
    'src/routes.js',
    'src/pages/index.ts',
    'src/pages/index.js',
    // Next.js
    'src/app/page.tsx',
    'pages/index.tsx',
    // General
    'routes.ts',
    'routes.js',
    'router.ts',
    'router.js'
  ];

  for (const pattern of patterns) {
    const fullPath = path.join(projectDir, pattern);
    try {
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const found = parseRouteFile(content, pattern);
        routes.push(...found);
      }
    } catch {
      // ignore
    }
  }

  return routes;
}

/**
 * Parse route file content based on framework
 */
function parseRouteFile(content, filename) {
  const routes = [];
  const ext = path.extname(filename);

  // Angular: { path: 'xxx', ... }
  if (content.includes('path:') || filename.includes('.routes.')) {
    const pathMatches = content.matchAll(/path:\s*['"`]([^'"`]+)['"`]/g);
    for (const match of pathMatches) {
      const route = match[1];
      if (route && !route.startsWith('**') && !route.includes(':')) {
        routes.push('/' + route);
      }
    }
  }

  // React/Vue: { path: 'xxx' } or path: 'xxx'
  const genericMatches = content.matchAll(/(?:path|route|component):\s*['"`]([^'"`/][^'"`]*?)['"`]/g);
  for (const match of genericMatches) {
    const route = match[1];
    if (route && !route.startsWith('**') && !route.includes(':') && route.length > 1) {
      routes.push(route.startsWith('/') ? route : '/' + route);
    }
  }

  // Route array: ['/xxx', '/yyy']
  const arrayMatches = content.matchAll(/\[['"`]([^'"`/][^'"`]+)['"`]\]/g);
  for (const match of arrayMatches) {
    const route = match[1];
    if (route && !route.startsWith('...')) {
      routes.push('/' + route);
    }
  }

  return [...new Set(routes)].slice(0, 30);
}

/**
 * Discover routes from sitemap.xml
 */
async function discoverFromSitemap(baseUrl) {
  const routes = [];

  try {
    const sitemapUrl = new URL('/sitemap.xml', baseUrl).href;
    const response = await fetch(sitemapUrl, { timeout: 5000 });

    if (response.ok) {
      const xml = await response.text();
      const urlMatches = xml.matchAll(/<loc>[^<]*\/([^<]+)<\/loc>/g);

      for (const match of urlMatches) {
        const path = '/' + match[1];
        // Filter out only XML, images, etc
        if (!path.endsWith('.xml') && !path.endsWith('.png') && !path.endsWith('.jpg')) {
          routes.push(path.split('?')[0]);
        }
      }
    }
  } catch {
    // sitemap not found or parse error - ignore
  }

  return routes;
}

/**
 * Discover routes from DOM links
 */
async function discoverFromDOM(page) {
  return page.evaluate(() => {
    const routes = new Set();

    // Collect links
    const links = document.querySelectorAll('a[href]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href && href.startsWith('/') && !href.startsWith('//')) {
        routes.add(href.split('?')[0].split('#')[0]);
      }
    }

    // Collect form actions
    const forms = document.querySelectorAll('form[action]');
    for (const form of forms) {
      const action = form.getAttribute('action');
      if (action && action.startsWith('/') && !action.startsWith('//')) {
        routes.add(action.split('?')[0].split('#')[0]);
      }
    }

    return Array.from(routes).filter(r => r.length > 1 && r !== '/').slice(0, 20);
  });
}

export default discoverRoutesAdvanced;
