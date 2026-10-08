/**
 * Broken Image Analyzer
 * Detecta <img> que terminou de carregar sem pixels (404, formato inválido).
 * Imagens lazy ainda não requisitadas não contam.
 */

import { createFinding, SEVERITY } from '../findings/schema.js';
import { ensureDomHelpers } from './dom-helpers.js';

const LOAD_TIMEOUT = 3000;

export async function analyzeBrokenImages(context) {
  const { page, route, viewport } = context;
  const findings = [];

  await ensureDomHelpers(page);
  const result = await page.evaluate(async (timeout) => {
    const { getSelector, isRendered } = window.__jevUiAudit;
    const imgs = Array.from(document.images).filter(img => img.currentSrc || img.getAttribute('src'));

    // Espera quem ainda está carregando, sem travar o audit
    await Promise.race([
      Promise.all(imgs.filter(img => !img.complete && img.loading !== 'lazy').map(img =>
        new Promise(r => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }))),
      new Promise(r => setTimeout(r, timeout))
    ]);

    return imgs
      .filter(img => img.complete && img.naturalWidth === 0 && isRendered(img))
      .slice(0, 15)
      .map(img => ({
        tag: 'img',
        id: img.id || null,
        selector: getSelector(img),
        src: (img.currentSrc || img.getAttribute('src')).slice(0, 200),
        alt: img.getAttribute('alt')
      }));
  }, LOAD_TIMEOUT);

  for (const item of result) {
    findings.push(createFinding({
      rule: 'broken-image',
      category: 'visual',
      severity: SEVERITY.HIGH,
      confidence: 0.95,
      route,
      viewport,
      element: { tag: item.tag, id: item.id, textPreview: item.alt, selector: item.selector },
      message: `Imagem não carregou: ${item.src}`,
      metrics: { src: item.src }
    }));
  }

  return findings;
}

export default analyzeBrokenImages;
