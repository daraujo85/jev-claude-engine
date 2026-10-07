/**
 * Visibility Analyzer
 * Detects invisible, hidden, or off-screen elements.
 */

import { createFinding, SEVERITY } from '../findings/schema.js';

export async function analyzeVisibility(context) {
  const { page, route, viewport } = context;
  const findings = [];

  const result = await page.evaluate((vp) => {
    const findings = [];
    const elements = Array.from(document.querySelectorAll('*'));

    for (const el of elements) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      // Skip tiny elements
      if (rect.width < 5 || rect.height < 5) continue;

      // Skip hidden elements
      if (style.display === 'none' || style.visibility === 'hidden') {
        continue; // Expected behavior
      }

      // Check for zero-size rendered elements
      if (rect.width === 0 || rect.height === 0) {
        findings.push({
          type: 'zero-size',
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          textPreview: el.textContent?.slice(0, 30) || null,
          selector: getSelector(el),
          style: { display: style.display, visibility: style.visibility }
        });
        continue;
      }

      // Check if element is rendered off-screen
      const isOffScreen = rect.right < 0 || rect.bottom < 0 ||
                          rect.left > vp.width || rect.top > vp.height;

      // Skip elements intentionally below the fold
      if (isOffScreen && rect.top > vp.height * 0.5) continue;

      // Check if covered by other elements (z-index check)
      const isCovered = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      ) !== el;

      if (isCovered && style.position !== 'static') {
        findings.push({
          type: 'covered',
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          textPreview: el.textContent?.slice(0, 30) || null,
          selector: getSelector(el),
          position: style.position,
          zIndex: style.zIndex
        });
      }
    }

    return findings.slice(0, 15);
  }, viewport);

  for (const item of result) {
    findings.push(createFinding({
      rule: item.type === 'zero-size' ? 'collapsed-element' : 'covered-element',
      severity: item.type === 'covered' ? SEVERITY.HIGH : SEVERITY.MEDIUM,
      confidence: 0.8,
      route,
      viewport,
      element: {
        tag: item.tag,
        id: item.id,
        textPreview: item.textPreview,
        selector: item.selector
      },
      message: item.type === 'zero-size'
        ? `Element has zero dimensions but is rendered`
        : `Element may be covered by another element`,
      metrics: item.style || {}
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

export default analyzeVisibility;
