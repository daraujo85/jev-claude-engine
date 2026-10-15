#!/usr/bin/env node
/**
 * JEV Pull Request Guard Hook (PreToolUse)
 * Intercepts PR creation commands in Claude Code (Bash tool).
 * Validates target (base) and source (head) branches against project rules.
 * 
 * Rules:
 * - If PR rules are not defined for the project, BLOCKS with exit code 2
 *   and instructs the agent to ask the user to define branch rules.
 * - If forbidden branch flow is attempted (e.g. develop -> release), BLOCKS with exit code 2.
 * - If compliant, exits 0.
 */

import { parsePrCommand, validatePrCreation } from '../src/pr-validator.js';
import { renderPrCard } from '../src/ui.js';
import { loadConfig, isEnabled } from '../src/jev-config.js';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  if (!input.trim()) {
    process.exit(0);
  }

  let toolInput = {};
  let toolName = '';
  let cwd = process.cwd();

  try {
    const json = JSON.parse(input);
    toolInput = json.tool_input || {};
    toolName = json.tool_name || '';
    cwd = json.cwd || process.cwd();
  } catch {
    // Unparseable payload -> fail-open
    process.exit(0);
  }

  // Only inspect command-line executions
  const command = toolInput.command || toolInput.cmd || '';
  if (!command) {
    process.exit(0);
  }

  const parsed = parsePrCommand(command, cwd);
  if (!parsed.isPrCreate) {
    // Not a PR creation command -> pass through immediately
    process.exit(0);
  }

  // Config-driven: allow disabling hook if explicitly turned off
  const cfg = loadConfig();
  if (!isEnabled(cfg, 'hooks', 'jev-pr-guard')) {
    process.exit(0);
  }

  // Validate the PR creation
  const validation = await validatePrCreation({
    head: parsed.head,
    base: parsed.base,
    cwd,
    command
  });

  if (!validation.allowed) {
    const card = renderPrCard({
      head: parsed.head,
      base: parsed.base,
      allowed: false,
      reason: validation.reason,
      message: validation.message
    });

    process.stderr.write(card);
    process.stderr.write(`\n${validation.message}\n`);
    process.exit(2); // Claude Code block signal
  }

  // PR creation is compliant with project rules!
  process.stdout.write(JSON.stringify({
    systemMessage: `[JEV PR GUARD] PR '${parsed.head}' → '${parsed.base}' verificado e autorizado conforme as regras do projeto.`
  }));
  process.exit(0);
}

main().catch(() => process.exit(0)); // Fail-open on unhandled exception
