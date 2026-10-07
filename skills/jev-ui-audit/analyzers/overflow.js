/**
 * Horizontal Overflow Analyzer
 * Detects when page content exceeds viewport width.
 */

import { createFinding, SEVERITY } from '../findings/schema.js';

export async function analyzeOverflow(context) {
  const { page, route, viewport } = context;
  const findings = [];

  const result = await page.evaluate((vp) => {
    const docEl = document.documentElement;
    const scrollWidth = docEl.scrollWidth;
    const clientWidth = docEl.clientWidth;
    const overflowX = scrollWidth - clientWidth;

    if (overflowX <= 0) {
      return { hasOverflow: false };
    }

    // Find elements extending beyond viewport
    const allElements = Array.from(document.querySelectorAll('*'));
    const overflowingElements = allElements.filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.right > vp.width && rect.width > 0;
    });

    // Find the likely root cause (first overflowing element in DOM tree)
    let rootElement = null;
    for (const el of overflowingElements) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        rootElement = el;
        break;
      }
    }

    return {
      hasOverflow: true,
      overflowPx: overflowX,
      scrollWidth,
      clientWidth,
      rootElement: rootElement ? {
        tag: rootElement.tagName.toLowerCase(),
        id: rootElement.id || null,
        className: rootElement.className || null,
        textPreview: rootElement.textContent?.slice(0, 50) || null,
        selector: getSelector(rootElement)
      } : null
    };
  }, viewport);

  if (result.hasOverflow) {
    findings.push(createFinding({
      rule: 'horizontal-overflow',
      severity: result.overflowPx > 50 ? SEVERITY.CRITICAL : SEVERITY.HIGH,
      confidence: 0.95,
      route,
      viewport,
      element: result.rootElement,
      message: `Page exceeds viewport by ${result.overflowPx}px`,
      metrics: {
        viewportWidth: result.clientWidth,
        pageScrollWidth: result.scrollWidth,
        overflowPx: result.overflowPx
      }
    }));
  }

  return findings;
}

function getSelector(el) {
  if (el.id) return `#${el.id}`;
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.trim().split(/\s+/).slice(0, 2);
    if (classes[0]) {
      return `${el.tagName.toLowerCase()}.${classes[0]}`;
    }
  }
  return el.tagName.toLowerCase();
}

export default analyzeOverflow;
