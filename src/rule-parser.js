import fs from 'node:fs';
import path from 'node:path';

/**
 * Extracts explicit architectural and coding rules from project files
 */
export function extractProjectRules(projectDir = process.cwd()) {
  const candidateFiles = [
    path.join(projectDir, 'CLAUDE.md'),
    path.join(projectDir, '.cursorrules'),
    path.join(projectDir, '.rules')
  ];

  const rules = [];

  for (const file of candidateFiles) {
    if (fs.existsSync(file)) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          // Extract bullet points that sound like rules
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
            const clean = trimmed.replace(/^[-*]|\d+\.\s*/, '').trim();
            if (clean.length > 10 && !clean.startsWith('#')) {
              rules.push(clean);
            }
          }
        }
      } catch {
        // Skip unreadable file
      }
    }
  }

  // Fallback defaults if no project rules file found
  if (rules.length === 0) {
    rules.push('Do not hardcode API credentials or secrets');
    rules.push('Ensure code changes include or respect test contracts');
    rules.push('Maintain clean architectural layer separation');
  }

  return rules.slice(0, 15); // Keep top 15 concise rules
}
