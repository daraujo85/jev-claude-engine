import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let cachedSkills = null;
let lastScanTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

/**
 * Parses frontmatter name & description from a SKILL.md file
 */
export function parseSkillMetadata(skillDir) {
  const skillFile = path.join(skillDir, 'SKILL.md');
  const baseName = path.basename(skillDir);

  if (!fs.existsSync(skillFile)) {
    return {
      id: baseName,
      name: baseName,
      description: `Skill for ${baseName}`
    };
  }

  try {
    // Read only first 2KB for fast frontmatter extraction
    const fd = fs.openSync(skillFile, 'r');
    const buf = Buffer.alloc(2048);
    const bytesRead = fs.readSync(fd, buf, 0, 2048, 0);
    fs.closeSync(fd);

    const text = buf.toString('utf-8', 0, bytesRead);
    const nameMatch = text.match(/^name:\s*(.+)$/m);
    const descMatch = text.match(/^description:\s*(.+)$/m);

    return {
      id: baseName,
      name: (nameMatch ? nameMatch[1].trim() : baseName),
      description: (descMatch ? descMatch[1].trim() : `Skill ${baseName}`)
    };
  } catch {
    return {
      id: baseName,
      name: baseName,
      description: `Skill ${baseName}`
    };
  }
}

/**
 * Scans directories for Claude Code skills
 */
export function scanInstalledSkills(options = {}) {
  const now = Date.now();
  if (cachedSkills && (now - lastScanTime < CACHE_TTL_MS) && !options.forceRefresh) {
    return cachedSkills;
  }

  const searchDirs = [
    path.join(os.homedir(), '.claude', 'skills'),
    path.join(process.cwd(), '.claude', 'skills')
  ];

  if (options.customDirs) {
    searchDirs.unshift(...options.customDirs);
  }

  const skills = [];
  const seenIds = new Set();

  for (const rootDir of searchDirs) {
    if (!fs.existsSync(rootDir)) continue;

    try {
      const entries = fs.readdirSync(rootDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;

        let fullPath = path.join(rootDir, entry.name);
        // Handle symlinks
        if (entry.isSymbolicLink()) {
          try {
            fullPath = fs.realpathSync(fullPath);
          } catch {
            continue;
          }
        }

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const meta = parseSkillMetadata(fullPath);
          if (!seenIds.has(meta.id)) {
            seenIds.add(meta.id);
            skills.push(meta);
          }
        }
      }
    } catch {
      // Ignore unreadable directory
    }
  }

  cachedSkills = skills;
  lastScanTime = now;
  return skills;
}
