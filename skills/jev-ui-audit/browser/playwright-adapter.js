/**
 * Playwright Browser Adapter
 * Provides browser abstraction for UI audit.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';

export class BrowserAdapter {
  constructor(options = {}) {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.options = {
      headless: options.headless ?? true,
      ...options
    };
  }

  async start() {
    // Detect if running on WSL with Windows Chrome
    let executablePath = undefined;

    // Try to connect via CDP if endpoint is provided
    if (this.options.cdpEndpoint) {
      console.log(`Connecting to Chrome via CDP: ${this.options.cdpEndpoint}`);
      try {
        this.browser = await chromium.connectOverCDP(this.options.cdpEndpoint);
      } catch (e) {
        console.log(`CDP connect failed: ${e.message}`);
        throw e;
      }
    } else if (process.platform === 'linux') {
      // On Linux, use bundled Chromium (skip Windows Chrome detection)
      console.log('Launching bundled Chromium on Linux');
      this.browser = await chromium.launch({
        headless: this.options.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
    } else {
      this.browser = await chromium.launch({
        headless: this.options.headless,
        executablePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    this.context = await this.browser.newContext({
      viewport: { width: 1440, height: 900 },
      ...(this.options.cookies && { cookies: this.options.cookies })
    });
    this.page = await this.context.newPage();

    // Run setup script if provided (e.g., login)
    if (this.options.setupScript) {
      await this.page.addScriptTag({ content: this.options.setupScript });
    }

    return this;
  }

  async setCookies(cookies) {
    if (!this.context) throw new Error('Browser not started');
    await this.context.addCookies(cookies);
    return this;
  }

  async authenticate(username, password, loginUrl, selectors = {}) {
    if (!this.page) throw new Error('Browser not started');

    const loginPage = loginUrl || this.options.loginUrl;
    if (!loginPage) throw new Error('No loginUrl provided');

    console.log(`🔐 Authenticating at ${loginPage}...`);
    await this.page.goto(loginPage, { waitUntil: 'networkidle' });

    // Senha é sempre type=password. O usuário é o campo de texto visível que
    // vem antes dela (forms de SPA costumam ter input sem type=email nem label)
    const pass = this.page.locator(selectors.password || 'input[type="password"]').first();
    await pass.waitFor({ state: 'visible', timeout: 10000 });
    const user = selectors.email
      ? this.page.locator(selectors.email).first()
      : this.page.locator([
        'input[type="email"]', 'input[autocomplete="username"]', 'input[name*="email" i]',
        'input[name*="user" i]', 'input[name*="login" i]',
        'input:not([type]), input[type="text"], input[type="tel"]'
      ].join(', ')).filter({ visible: true }).first();
    await user.fill(username);
    await pass.fill(password);

    // Erro de rede/HTTP durante o submit explica a falha melhor que a URL
    const netErrors = [];
    const onFail = r => netErrors.push(`${r.method()} ${r.url().replace(/\?.*/, '')} ${r.failure()?.errorText || ''}`.trim());
    const onResp = r => { if (r.status() >= 400 && r.request().resourceType() !== 'document') netErrors.push(`${r.status()} ${r.request().method()} ${r.url().replace(/\?.*/, '')}`); };
    this.page.on('requestfailed', onFail);
    this.page.on('response', onResp);

    const submit = this.page.locator(selectors.submit ||
      'button[type="submit"], input[type="submit"], button:has-text("Entrar"), button:has-text("Login")')
      .filter({ visible: true }).first();
    if (await submit.count()) await submit.click();
    else await pass.press('Enter');

    // Login só conta se o campo de senha sumir; senão as rotas seguintes
    // auditariam a tela de login sem ninguém perceber
    try {
      await pass.waitFor({ state: 'hidden', timeout: 15000 });
    } catch {
      const why = netErrors.length ? `; rede: ${netErrors.slice(0, 3).join(' | ')}` : '';
      throw new Error(`Login falhou: o campo de senha continua na tela (${this.page.url()})${why}`);
    } finally {
      this.page.off('requestfailed', onFail);
      this.page.off('response', onResp);
    }
    await this.page.waitForLoadState('networkidle').catch(() => {});
    console.log(`  Logado: ${this.page.url()}`);
    this.authenticated = true;

    return this;
  }

  // Rota que caiu de volta no login (sessão perdida, guard de rota)
  async isOnLoginForm() {
    if (!this.page) return false;
    return this.page.locator('input[type="password"]').filter({ visible: true }).count()
      .then(n => n > 0).catch(() => false);
  }

  async open(url) {
    if (!this.page) {
      throw new Error('Browser not started. Call start() first.');
    }
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    return this;
  }

  async setViewport(width, height) {
    if (!this.page) {
      throw new Error('Page not initialized.');
    }
    // setViewportSize vive em Page, não em BrowserContext
    await this.page.setViewportSize({ width, height });
    return this;
  }

  async waitForStableState(options = {}) {
    const {
      timeout = 5000,
      interval = 100,
      stabilityThreshold = 1
    } = options;

    if (!this.page) {
      throw new Error('Page not initialized.');
    }

    // Wait for network idle
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 3000 });
    } catch {
      // ignore timeout, continue
    }

    // Wait for layout stability
    const startTime = Date.now();
    let lastWidth = 0;
    let stableCount = 0;

    while (Date.now() - startTime < timeout) {
      const scrollWidth = await this.page.evaluate(() => document.documentElement.scrollWidth);
      const scrollHeight = await this.page.evaluate(() => document.documentElement.scrollHeight);

      if (Math.abs(scrollWidth - lastWidth) < stabilityThreshold) {
        stableCount++;
        if (stableCount >= 3) break;
      } else {
        stableCount = 0;
      }

      lastWidth = scrollWidth;
      await new Promise(r => setTimeout(r, interval));
    }

    return this;
  }

  async evaluate(fn) {
    if (!this.page) {
      throw new Error('Page not initialized.');
    }
    return this.page.evaluate(fn);
  }

  async screenshot(options = {}) {
    if (!this.page) {
      throw new Error('Page not initialized.');
    }
    return this.page.screenshot({
      type: 'png',
      ...options
    });
  }

  async getPageMetadata() {
    if (!this.page) {
      throw new Error('Page not initialized.');
    }
    return this.page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      scroll: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight
      }
    }));
  }

  async close() {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    return this;
  }
}

export default BrowserAdapter;
