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

    if (process.platform === 'linux') {
      const windowsChrome = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';
      if (fs.existsSync(windowsChrome)) {
        executablePath = windowsChrome;
        console.log('Using Windows Chrome on WSL');
      }
    }

    // Windows Chrome on WSL needs special handling - try with CDP connect
    if (process.platform === 'linux' && executablePath) {
      // Try launching with different approach for WSL
      try {
        this.browser = await chromium.launch({
          headless: true,
          executablePath,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--remote-debugging-port=9222'
          ]
        });
      } catch (e) {
        // Fallback: don't use Windows Chrome
        console.log('Windows Chrome failed, falling back to default');
        executablePath = undefined;
        this.browser = await chromium.launch({
          headless: this.options.headless,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
      }
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

    await this.page.goto(loginPage, { waitUntil: 'networkidle' });

    const emailSel = selectors.email || 'input[type="email"], input[name="email"], input[id="email"]';
    const passSel = selectors.password || 'input[type="password"], input[name="password"], input[id="password"]';
    const submitSel = selectors.submit || 'button[type="submit"], button:has-text("Entrar"), button:has-text("Login")';

    await this.page.fill(emailSel, username);
    await this.page.fill(passSel, password);
    await this.page.click(submitSel);
    await this.page.waitForLoadState('networkidle');

    return this;
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
