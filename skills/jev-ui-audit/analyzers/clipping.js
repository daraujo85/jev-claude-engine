/**
 * Clipping Analyzer
 * Detects when child content exceeds a parent with overflow clipping.
 */

import { createFinding, SEVERITY } from '../findings/schema.js';

export async function analyzeClipping(context) {
  const { page, route, viewport } = context;
  const findings = [];

  const result = await page.evaluate(() => {
    const findings = [];

    const allElements = Array.from(document.querySelectorAll('*'));

    for (const el of allElements) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      // Check if element has overflow clipping
      const overflowX = style.overflowX;
      const overflowY = style.overflowY;

      if (!['hidden', 'clip', 'auto', 'scroll'].includes(overflowX) &&
          !['hidden', 'clip', 'auto', 'scroll'].includes(overflowY)) {
        continue;
      }

      // Check for text clipping (scrollWidth > clientWidth)
      if (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) {
        const hasTextClipping = style.overflowX !== 'visible' &&
                                style.textOverflow !== 'clip' &&
                                style.whiteSpace === 'nowrap';

        // Skip intentional ellipsis
        if (hasTextClipping && (style.textOverflow === 'ellipsis' || style.lineClamp)) {
          continue;
        }

        findings.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          className: el.className?.baseVal || el.className || null,
          textPreview: el.textContent?.slice(0, 30) || null,
          overflowX,
          overflowY,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          selector: getSelector(el)
        });
      }
    }

    return findings.slice(0, 20); // Limit findings
  });

  for (const item of result) {
    const overflowPx = Math.max(
      item.scrollWidth - item.clientWidth,
      item.scrollHeight - item.clientHeight
    );

    findings.push(createFinding({
      rule: 'content-clipping',
      severity: overflowPx > 20 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
      confidence: 0.85,
      route,
      viewport,
      element: {
        tag: item.tag,
        id: item.id,
        textPreview: item.textPreview,
        selector: item.selector
      },
      message: `Content clipped by overflow-${item.overflowX || item.overflowY}`,
      metrics: {
        overflowX: item.overflowX,
        overflowY: item.overflowY,
        scrollWidth: item.scrollWidth,
        clientWidth: item.clientWidth,
        scrollHeight: item.scrollHeight,
        clientHeight: item.clientHeight
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

export default analyzeClipping;
