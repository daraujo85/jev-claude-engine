#!/usr/bin/env node
/**
 * JEV Project Profile CLI — scan a repo and emit .claude/jev-profile.md
 * with architecture, code style and design system. Same engine as
 * scripts/jev-profile.js, wrapped for the skill.
 *
 * Usage:
 *   jev-project-profile [dir]          # write .claude/jev-profile.md
 *   jev-project-profile [dir] --json   # machine-readable profile
 *   jev-project-profile [dir] --check  # exit 0 if profile exists, 1 if missing
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(__dirname, '..', '..', 'scripts', 'jev-profile.js');

const dir = process.argv[2] || process.cwd();
const asJson = process.argv.includes('--json');
const checkOnly = process.argv.includes('--check');

const profilePath = join(dir, '.claude', 'jev-profile.md');

if (checkOnly) {
  process.exit(existsSync(profilePath) ? 0 : 1);
}

const args = [ENGINE, dir];
if (asJson) args.push('--json');
const res = spawnSync('node', args, { stdio: 'inherit' });
process.exit(res.status || 0);