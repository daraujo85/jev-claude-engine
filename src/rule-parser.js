import fs from 'node:fs';
import path from 'node:path';

/**
 * Finds candidate rule files by checking the current project directory
 * and walking up parent directories up to git root or filesystem boundary.
 */
function findRuleFiles(startDir) {
  const files = [];
  let current = path.resolve(startDir);
  const root = path.parse(current).root;

  const RELATIVE_CANDIDATES = [
    path.join('.claude', 'jev-rules.md'),
    '.jev-rules.md',
    path.join('.claude', 'jev-profile.md'),
    'CLAUDE.md',
    '.cursorrules',
    path.join('.cursor', 'rules'),
    '.rules',
    '.windsurfrules'
  ];

  while (current && current !== root) {
    for (const rel of RELATIVE_CANDIDATES) {
      const candidate = path.join(current, rel);
      if (fs.existsSync(candidate) && !files.includes(candidate)) {
        files.push(candidate);
      }
    }

    // Stop traversing up if we hit a git root or home directory root
    if (fs.existsSync(path.join(current, '.git'))) {
      break;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return files;
}

/**
 * Extracts explicit architectural and coding rules from project files.
 * Priority is given to `.claude/jev-rules.md` (cláusula pétrea) and `CLAUDE.md`.
 */
export function extractProjectRules(projectDir = process.cwd()) {
  const candidateFiles = findRuleFiles(projectDir);
  const rules = [];
  const seen = new Set();

  for (const file of candidateFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const isProfile = file.endsWith('jev-profile.md');

      let textToParse = content;
      if (isProfile) {
        // Only extract rules inside "## Project rules" section
        const match = content.match(/## Project rules\s*\n([\s\S]*?)(?=\n## |$)/i);
        textToParse = match ? match[1] : '';
      }

      if (!textToParse) continue;

      const lines = textToParse.split('\n');
      let currentRule = null;

      for (const line of lines) {
        const trimmed = line.trim();
        const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed);

        if (isBullet) {
          if (currentRule) {
            const clean = currentRule.trim();
            if (clean.length > 5 && !clean.startsWith('#') && !clean.startsWith('_none declared') && !seen.has(clean)) {
              seen.add(clean);
              rules.push(clean);
            }
          }
          currentRule = trimmed.replace(/^[-*]|\d+\.\s*/, '').trim();
        } else if (currentRule && trimmed.length > 0 && !trimmed.startsWith('#')) {
          // Continuation line of multi-line bullet
          currentRule += ' ' + trimmed;
        } else if (trimmed.length === 0 || trimmed.startsWith('#')) {
          if (currentRule) {
            const clean = currentRule.trim();
            if (clean.length > 5 && !clean.startsWith('#') && !clean.startsWith('_none declared') && !seen.has(clean)) {
              seen.add(clean);
              rules.push(clean);
            }
            currentRule = null;
          }
        }
      }

      if (currentRule) {
        const clean = currentRule.trim();
        if (clean.length > 5 && !clean.startsWith('#') && !clean.startsWith('_none declared') && !seen.has(clean)) {
          seen.add(clean);
          rules.push(clean);
        }
      }
    } catch {
      // Skip unreadable file
    }
  }

  // Fallback defaults if no project rules file found
  if (rules.length === 0) {
    rules.push('Do not hardcode API credentials or secrets');
    rules.push('Ensure code changes include or respect test contracts');
    rules.push('Maintain clean architectural layer separation');
  }

  return rules.slice(0, 25);
}

/**
 * Checks if the project enforces a strict no-comments policy.
 * Matches patterns like "Código sem comentários", "Sem comentários no código", "no comments", etc.
 */
export function hasNoCommentsPolicy(projectDir = process.cwd()) {
  const rules = extractProjectRules(projectDir);
  const NO_COMMENTS_REGEX = /(c[oó]digo\s+sem\s+coment[aá]rios?|sem\s+coment[aá]rios?(\s+no\s+c[oó]digo)?|proibido.*coment[aá]rios?|sem\s+nenhum\s+coment[aá]rio|nunca.*coment[aá]rios?|no\s+comments?|clean\s+code\s+without\s+comments)/i;

  return rules.some(r => NO_COMMENTS_REGEX.test(r));
}

/**
 * Extracts and analyzes PR and branch rules for the project.
 * Identifies forbidden and allowed branch flows.
 */
export function getProjectPrRules(projectDir = process.cwd()) {
  const rules = extractProjectRules(projectDir);
  const prRelevantRules = rules.filter(r =>
    /\b(branch|branches|pull\s*requests?|prs?|merges?|release|develop|main|master)\b/i.test(r)
  );

  const forbiddenCombinations = [];
  const allowedCombinations = [];

  for (const r of prRelevantRules) {
    // Specific rule: develop -> release forbidden
    // e.g.: "Nunca abrir PR de develop → release direto", "nunca pode pegar develop e levar para release"
    if (/(nunca.*(?:abrir|criar).*pr.*develop.*(?:→|->|para).*release|nunca.*develop.*(?:→|->|para).*release|nunca.*levar.*develop.*release)/i.test(r)) {
      forbiddenCombinations.push({
        head: 'develop',
        base: 'release',
        reason: r
      });
    }

    // Generic pattern: "nunca abrir PR de X para Y"
    const genericForbidden = r.match(/nunca\s+(?:abrir|criar)\s+pr\s+de\s+([a-zA-Z0-9_\-\/]+)\s+(?:→|->|para)\s+([a-zA-Z0-9_\-\/]+)/i);
    if (genericForbidden) {
      const head = genericForbidden[1].replace(/[`'"]/g, '').trim().toLowerCase();
      const base = genericForbidden[2].replace(/[`'"]/g, '').trim().toLowerCase();
      if (!forbiddenCombinations.some(f => f.head === head && f.base === base)) {
        forbiddenCombinations.push({
          head,
          base,
          reason: r
        });
      }
    }

    // Allowed flows: "branch de trabalho → release"
    const allowedMatch = r.match(/(?:permitido|fluxo|pode(?:\s+abrir)?\s+pr\s+de)\s+([a-zA-Z0-9_\-\/*]+)\s+(?:→|->|para)\s+([a-zA-Z0-9_\-\/*]+)/i);
    if (allowedMatch) {
      const head = allowedMatch[1].replace(/[`'"]/g, '').trim();
      const base = allowedMatch[2].replace(/[`'"]/g, '').trim();
      if (head.length > 1 && base.length > 1) {
        allowedCombinations.push({
          head,
          base,
          description: r
        });
      }
    }
  }

  return {
    hasPrRules: prRelevantRules.length > 0,
    rawRules: prRelevantRules,
    forbiddenCombinations,
    allowedCombinations,
    flowDescription: prRelevantRules.join('\n')
  };
}

/**
 * Appends a rule to .claude/jev-rules.md for the given project directory.
 */
export function saveProjectRule(projectDir = process.cwd(), ruleText) {
  let targetDir = path.resolve(projectDir);
  // If inside subfolder of git repo, find git root
  let current = targetDir;
  while (current && current !== path.parse(current).root) {
    if (fs.existsSync(path.join(current, '.git')) || fs.existsSync(path.join(current, '.claude', 'jev-rules.md'))) {
      targetDir = current;
      break;
    }
    current = path.dirname(current);
  }

  const claudeDir = path.join(targetDir, '.claude');
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  const rulesFile = path.join(claudeDir, 'jev-rules.md');
  const bullet = ruleText.trim().startsWith('- ') ? ruleText.trim() : `- ${ruleText.trim()}`;

  if (!fs.existsSync(rulesFile)) {
    const initialContent = `# Project rules\n\nRegras do time que o scan não detecta. Cláusula pétrea — subagents seguem sempre.\n\n${bullet}\n`;
    fs.writeFileSync(rulesFile, initialContent, 'utf-8');
  } else {
    const existing = fs.readFileSync(rulesFile, 'utf-8');
    if (!existing.includes(ruleText.trim())) {
      fs.appendFileSync(rulesFile, `\n${bullet}\n`, 'utf-8');
    }
  }

  return rulesFile;
}
