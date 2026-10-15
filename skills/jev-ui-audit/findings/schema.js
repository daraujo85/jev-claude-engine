/**
 * Finding Schema Contract
 * All analyzers must emit findings in this format.
 */

export const SEVERITY = {
  BLOCKER: 'blocker',
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info'
};

export const CATEGORY = {
  LAYOUT: 'layout',
  ACCESSIBILITY: 'accessibility',
  RESPONSIVE: 'responsive',
  VISUAL: 'visual'
};

let findingCounter = 0;

export function createFindingId() {
  return `JEV-UI-${String(++findingCounter).padStart(3, '0')}`;
}

export function resetFindingCounter() {
  findingCounter = 0;
}

export function createFinding({
  rule,
  category = CATEGORY.LAYOUT,
  severity = SEVERITY.MEDIUM,
  confidence = 0.8,
  route,
  viewport,
  element = null,
  message,
  metrics = {},
  rootCause = null,
  evidence = {}
}) {
  return {
    id: createFindingId(),
    rule,
    category,
    severity,
    confidence,
    route,
    viewport,
    element,
    message,
    metrics,
    rootCause,
    evidence,
    timestamp: new Date().toISOString()
  };
}

export function normalizeSeverity(axeSeverity) {
  const map = {
    'critical': SEVERITY.CRITICAL,
    'serious': SEVERITY.HIGH,
    'moderate': SEVERITY.MEDIUM,
    'minor': SEVERITY.LOW
  };
  return map[axeSeverity?.toLowerCase()] || SEVERITY.MEDIUM;
}
