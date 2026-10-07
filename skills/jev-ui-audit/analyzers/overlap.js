/**
 * Overlap/Collision Analyzer
 * Detects overlapping elements.
 */

import { createFinding, SEVERITY } from '../findings/schema.js';

export async function analyzeOverlap(context) {
  const { page, route, viewport } = context;
  const findings = [];

  const result = await page.evaluate(() => {
    const findings = [];
    const elements = Array.from(document.querySelectorAll('*'));

    // Check pairs for overlap (sampled for performance)
    const sampleSize = Math.min(elements.length, 200);
    const step = Math.max(1, Math.floor(elements.length / sampleSize));
    const sampled = elements.filter((_, i) => i % step === 0);

    for (let i = 0; i < sampled.length; i++) {
      const el1 = sampled[i];
      const rect1 = el1.getBoundingClientRect();

      if (rect1.width < 5 || rect1.height < 5) continue;

      for (let j = i + 1; j < sampled.length; j++) {
        const el2 = sampled[j];
        const rect2 = el2.getBoundingClientRect();

        if (rect2.width < 5 || rect2.height < 5) continue;

        // Check intersection
        const overlapX = Math.max(0, Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left));
        const overlapY = Math.max(0, Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top));

        if (overlapX > 0 && overlapY > 0) {
          const area1 = rect1.width * rect1.height;
          const area2 = rect2.width * rect2.height;
          const overlapArea = overlapX * overlapY;

          // Skip small overlaps (< 10% of smaller element)
          if (overlapArea < Math.min(area1, area2) * 0.1) continue;

          // Check if interactive
          const isInteractive1 = isInteractive(el1);
          const isInteractive2 = isInteractive(el2);

          if (isInteractive1 || isInteractive2) {
            findings.push({
              element1: {
                tag: el1.tagName.toLowerCase(),
                textPreview: el1.textContent?.slice(0, 30) || null,
                interactive: isInteractive1,
                selector: getSelector(el1)
              },
              element2: {
                tag: el2.tagName.toLowerCase(),
                textPreview: el2.textContent?.slice(0, 30) || null,
                interactive: isInteractive2,
                selector: getSelector(el2)
              },
              overlapX,
              overlapY,
              overlapArea
            });
          }
        }
      }
    }

    return findings.slice(0, 10); // Limit to top findings
  });

  for (const item of result) {
    findings.push(createFinding({
      rule: 'element-overlap',
      severity: item.element1.interactive || item.element2.interactive
        ? SEVERITY.HIGH
        : SEVERITY.MEDIUM,
      confidence: 0.8,
      route,
      viewport,
      element: item.element1,
      message: `Elements overlap: ${item.element1.tag} × ${item.element2.tag}`,
      metrics: {
        overlapX: item.overlapX,
        overlapY: item.overlapY,
        overlapArea: item.overlapArea
      }
    }));
  }

  return findings;
}

function isInteractive(el) {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role');
  return ['button', 'a', 'input', 'select', 'textarea'].includes(tag) ||
         ['button', 'link', 'checkbox', 'radio', 'menuitem'].includes(role) ||
         el.hasAttribute('onclick') ||
         el.hasAttribute('onchange');
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

export default analyzeOverlap;
