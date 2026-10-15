import { execSync } from 'node:child_process';
import path from 'node:path';
import { getProjectPrRules } from './rule-parser.js';
import { JevClient } from './client.js';
import { QUESTION_TYPES } from './types.js';

/**
 * Attempts to get the current git branch in the target directory.
 */
function getCurrentBranch(cwd = process.cwd()) {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000
    }).trim();
    return branch || 'HEAD';
  } catch {
    return 'HEAD';
  }
}

/**
 * Parses a CLI command to detect if it is creating a Pull Request (via gh, az, or glab)
 * and extracts source (head) and target (base) branches.
 */
export function parsePrCommand(command = '', cwd = process.cwd()) {
  if (!command || typeof command !== 'string') {
    return { isPrCreate: false };
  }

  const trimmed = command.trim();

  // gh pr create
  // Flags: --base / -B, --head / -H, --title / -t, --body / -b
  const isGhPrCreate = /(?:^|\s|&&|\|\||;)(?:gh|rtk\s+gh)\s+pr\s+create\b/.test(trimmed);

  // az repos pr create
  // Flags: --target-branch / -t, --source-branch / -s
  const isAzPrCreate = /(?:^|\s|&&|\|\||;)(?:az|rtk\s+az)\s+repos\s+pr\s+create\b/.test(trimmed);

  // glab mr create
  // Flags: --target-branch / -b, --source-branch / -s
  const isGlabMrCreate = /(?:^|\s|&&|\|\||;)(?:glab|rtk\s+glab)\s+mr\s+create\b/.test(trimmed);

  if (!isGhPrCreate && !isAzPrCreate && !isGlabMrCreate) {
    return { isPrCreate: false };
  }

  let head = '';
  let base = '';
  let title = '';

  const extractFlag = (flags) => {
    for (const f of flags) {
      // --flag value or --flag="value" or --flag='value'
      const re = new RegExp(`(?:--${f}|-${f})(?:=|\\s+)(?:["']([^"']+)["']|([^\\s"';&|]+))`);
      const m = trimmed.match(re);
      if (m) {
        return m[1] || m[2];
      }
    }
    return '';
  };

  if (isGhPrCreate) {
    base = extractFlag(['base', 'B']);
    head = extractFlag(['head', 'H']);
    title = extractFlag(['title', 't']);
  } else if (isAzPrCreate) {
    base = extractFlag(['target-branch', 't']);
    head = extractFlag(['source-branch', 's']);
    title = extractFlag(['title']);
  } else if (isGlabMrCreate) {
    base = extractFlag(['target-branch', 'b']);
    head = extractFlag(['source-branch', 's']);
    title = extractFlag(['title', 't']);
  }

  // If head is not specified in the CLI command, git uses current branch
  if (!head) {
    head = getCurrentBranch(cwd);
  }

  // If base is not specified, default to 'main' or target repo default
  if (!base) {
    base = 'main';
  }

  return {
    isPrCreate: true,
    tool: isGhPrCreate ? 'gh' : isAzPrCreate ? 'az' : 'glab',
    head,
    base,
    title,
    rawCommand: trimmed
  };
}

/**
 * Validates PR creation against the project's branch rules.
 * 
 * Rules:
 * 1. If project has NO PR rules defined:
 *    -> BLOCKS and requires asking the user to define branch rules.
 * 2. If PR rules defined:
 *    -> Verifies that head and base are allowed.
 *    -> Explicitly blocks forbidden flows (e.g. develop -> release).
 */
export async function validatePrCreation({ head, base, cwd = process.cwd(), command = '' }) {
  const prRules = getProjectPrRules(cwd);

  // 1. If no PR rules are defined in the project, we MUST ask the user
  if (!prRules.hasPrRules) {
    return {
      allowed: false,
      reason: 'PR_RULES_UNDEFINED',
      head,
      base,
      message:
        `🛑 [JEV PR GUARD]: Regras de criação de PR NÃO foram definidas para este projeto!\n\n` +
        `Antes de criar qualquer Pull Request, você DEVE perguntar ao usuário:\n` +
        `  1. Quais branches são permitidas para criar PR neste projeto?\n` +
        `  2. Quais combinações são proibidas (ex.: nunca abrir PR de develop direto para release)?\n` +
        `  3. Qual é o fluxo correto de branches (ex.: branch de trabalho → develop / release)?\n\n` +
        `Após o usuário responder, registre a convenção no arquivo .claude/jev-rules.md (ou via 'jev pr-rules set "..."') e tente criar a PR novamente.`
    };
  }

  const normHead = (head || '').toLowerCase();
  const normBase = (base || '').toLowerCase();

  // 2. Deterministic check against forbidden combinations
  for (const forbidden of prRules.forbiddenCombinations) {
    const forbiddenHead = forbidden.head.toLowerCase();
    const forbiddenBase = forbidden.base.toLowerCase();

    const matchesHead = normHead === forbiddenHead || normHead.includes(forbiddenHead);
    const matchesBase = normBase === forbiddenBase || normBase.includes(forbiddenBase);

    if (matchesHead && matchesBase) {
      return {
        allowed: false,
        reason: 'FORBIDDEN_BRANCH_FLOW',
        head,
        base,
        ruleViolated: forbidden.reason,
        message:
          `❌ [JEV PR GUARD BLOQUEIO AUTOMÁTICO]: Tentativa de PR '${head}' → '${base}' viola as regras do projeto!\n\n` +
          `🚨 REGRA VIOLADA: ${forbidden.reason}\n\n` +
          `💡 COMO RESOLVER: Nunca abra PR de '${head}' direto para '${base}'. Selecione apenas os commits necessários (cherry-pick), crie uma branch de trabalho/release específica e abra a PR a partir dessa nova branch.`
      };
    }
  }

  // 3. Optional JEV System One semantic evaluation for subtle branch policies
  try {
    const client = new JevClient();
    const context = `
PROJETO: ${path.basename(cwd)}
REGRAS DE BRANCH/PR DO PROJETO:
${prRules.rawRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

TENTATIVA DE PULL REQUEST:
Origem (HEAD/Source): ${head}
Destino (BASE/Target): ${base}
Comando: ${command}
`;

    const result = await client.evaluate(
      context,
      {
        violates_pr_rule: {
          type: QUESTION_TYPES.NOUL,
          instructions: 'Esta tentativa de criar Pull Request com a branch de origem e destino especificadas viola alguma regra ou convenção de branches do projeto?'
        }
      },
      {
        feature: 'pr-guard',
        tokensSpared: 4000,
        projectDir: cwd
      }
    );

    const answers = result?.answers || {};
    if (answers.violates_pr_rule?.noul === true && (answers.violates_pr_rule?.probability || 0) >= 0.75) {
      return {
        allowed: false,
        reason: 'SEMANTIC_RULE_VIOLATION',
        head,
        base,
        confidence: answers.violates_pr_rule?.probability || 0.85,
        message:
          `❌ [JEV PR GUARD BLOQUEIO AUTOMÁTICO]: O JEV detectou que a PR '${head}' → '${base}' viola as diretrizes de branch deste projeto (${Math.round((answers.violates_pr_rule?.probability || 0.85) * 100)}% certeza).\n` +
          `Revise as regras em .claude/jev-rules.md antes de prosseguir.`
      };
    }
  } catch {
    // Fail-open for client network error if deterministic checks passed
  }

  return {
    allowed: true,
    head,
    base,
    message: `[JEV PR GUARD] PR '${head}' → '${base}' validado com sucesso conforme as regras do projeto.`
  };
}
