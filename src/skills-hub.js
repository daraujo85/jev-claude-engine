/**
 * JEV Skills Hub — discovery de skills/MCP/tools dos harnesses globais
 * e geração do catálogo em ~/.jev/skills-hub/ (INDEX.md + INDEX.json).
 *
 * O objetivo: a sessão só conhece a skill de entrada "jev-hub". O JEV, sob
 * demanda, consulta o INDEX.md (catálogo) pra saber o que existe e só então
 * mergulha na skill específica. Nada é carregado no contexto da sessão.
 *
 * Sources varridas:
 *   - Skills: ~/.claude/skills, ~/.agents/skills, ~/.opencode/skills,
 *     ~/.config/opencode/skills, .claude/skills do projeto, skills/ do repo JEV
 *   - MCP: ~/.claude.json (mcpServers), ~/.config/opencode/opencode.json (mcp)
 *   - Tools: plugins dos harnesses (~/.config/opencode/plugins)
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const HUB_DIR = path.join(os.homedir(), '.jev', 'skills-hub');
export const SKILLS_LINK_DIR = path.join(HUB_DIR, 'skills');
export const MCP_LINK_DIR = path.join(HUB_DIR, 'mcp');
export const TOOLS_LINK_DIR = path.join(HUB_DIR, 'tools');
export const INDEX_MD = path.join(HUB_DIR, 'INDEX.md');
export const INDEX_JSON = path.join(HUB_DIR, 'INDEX.json');

const SOURCE_DIRS = [
  path.join(os.homedir(), '.claude', 'skills'),
  path.join(os.homedir(), '.agents', 'skills'),
  path.join(os.homedir(), '.opencode', 'skills'),
  path.join(os.homedir(), '.config', 'opencode', 'skills'),
  // project-level skills (cwd/.claude/skills) when present
  path.join(process.cwd(), '.claude', 'skills'),
];

// JEV's own skills (this repo) — always part of the hub.
const JEV_REPO_SKILLS = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'skills');

/**
 * Parse name/description from SKILL.md frontmatter (cheap, first 2KB).
 */
export function parseSkillFrontmatter(skillFile) {
  const base = path.basename(path.dirname(skillFile));
  try {
    const fd = fs.openSync(skillFile, 'r');
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    const text = buf.toString('utf-8', 0, n);
    const name = text.match(/^name:\s*(.+)$/m)?.[1]?.trim();
    // description: plain | >- folded | > multi-line, until next frontmatter key
    let desc = '';
    const m = text.match(/^description:\s*(.+)$/m);
    if (m) {
      desc = m[1].trim();
      if (desc === '>-' || desc === '>' || desc === '|') {
        const start = m.index + m[0].length;
        const rest = text.slice(start);
        const folded = rest.match(/^((?:[ \t]+[^\n]*\n?)*)/);
        desc = (folded?.[1] || '').split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
      }
    }
    return {
      name: name || base,
      description: desc || `Skill ${base}`,
    };
  } catch {
    return { name: base, description: `Skill ${base}` };
  }
}

function listSkillDirs(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    let full = path.join(root, entry.name);
    try {
      if (entry.isSymbolicLink()) full = fs.realpathSync(full);
      if (fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'SKILL.md'))) {
        out.push(full);
      }
    } catch { /* skip unreadable */ }
  }
  return out;
}

function collectSkills() {
  const seen = new Map(); // id -> record
  const roots = [...SOURCE_DIRS, JEV_REPO_SKILLS];
  const projectRoot = path.join(process.cwd(), '.claude', 'skills');
  for (const root of roots) {
    const dirs = listSkillDirs(root);
    for (const dir of dirs) {
      const skillFile = path.join(dir, 'SKILL.md');
      const id = path.basename(dir);
      const { name, description } = parseSkillFrontmatter(skillFile);
      const source = root === projectRoot ? 'project'
        : root.includes('claude') && !root.includes('opencode') && !root.includes('agents') ? 'claude'
        : root.includes('agents') ? 'agents'
        : root.includes('opencode') ? 'opencode'
        : 'jev';
      // jev own skills win on id collision
      if (source === 'jev' || !seen.has(id)) {
        seen.set(id, { id, name, description: String(description || '').slice(0, 200), source, path: dir });
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function collectMcp() {
  const out = [];
  const sources = [
    { file: path.join(os.homedir(), '.claude.json'), key: 'mcpServers', harness: 'claude' },
    { file: path.join(os.homedir(), '.config', 'opencode', 'opencode.json'), key: 'mcp', harness: 'opencode' },
  ];
  for (const { file, key, harness } of sources) {
    try {
      const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
      const servers = cfg[key] || {};
      for (const [name, s] of Object.entries(servers)) {
        const cmd = Array.isArray(s?.command) ? s.command[0] : s?.command;
        const desc = s?.description || `MCP server ${name}`;
        out.push({ id: name, name, description: String(desc).slice(0, 200), source: `${harness}-mcp`, path: `${harness}:${name}`, command: cmd });
      }
    } catch { /* skip */ }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function collectTools() {
  const out = [];
  const pluginDirs = [
    path.join(os.homedir(), '.config', 'opencode', 'plugins'),
    path.join(os.homedir(), '.claude', 'plugins', 'cache'),
  ];
  for (const root of pluginDirs) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.startsWith('temp_')) continue;
      const full = path.join(root, entry.name);
      const isDir = entry.isDirectory();
      const id = isDir ? entry.name : entry.name.replace(/\.(js|ts)$/, '');
      out.push({
        id,
        name: id,
        description: isDir ? `Plugin/tool ${id}` : `Plugin/tool ${id}`,
        source: root.includes('opencode') ? 'opencode-plugin' : 'claude-plugin',
        path: full,
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function slug(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function writeIndexMarkdown({ skills, mcp, tools }) {
  const lines = [
    '# JEV Skills Hub — catálogo',
    '',
    'Skills, MCP servers e tools descobertos dos harnesses globais (Claude Code,',
    'OpenCode, agents) + skills próprias do JEV. Nada aqui é carregado no contexto',
    'da sessão: o modelo consulta este índice sob demanda e o JEV decide qual item',
    'usar. Para saber o que uma skill faz de verdade, ler o SKILL.md no caminho.',
    '',
    `Gerado: ${new Date().toISOString()}`,
    '',
    '## Skills',
    '',
    '| id | o que faz | origem | path |',
    '|---|---|---|---|',
    ...skills.map((s) => `| ${s.id} | ${String(s.description).replace(/\|/g, '\\|').replace(/\n/g, ' ')} | ${s.source} | \`${s.path}\` |`),
    '',
    '## MCP servers',
    '',
    '| id | o que faz | origem |',
    '|---|---|---|',
    ...mcp.map((m) => `| ${m.id} | ${String(m.description).replace(/\|/g, '\\|').replace(/\n/g, ' ')} | ${m.source} |`),
    '',
    '## Tools / plugins',
    '',
    '| id | origem | path |',
    '|---|---|---|',
    ...tools.map((t) => `| ${t.id} | ${t.source} | \`${t.path}\` |`),
    '',
  ];
  fs.mkdirSync(HUB_DIR, { recursive: true });
  fs.writeFileSync(INDEX_MD, lines.join('\n'), 'utf8');
}

function writeIndexJson(data) {
  fs.writeFileSync(INDEX_JSON, JSON.stringify(data, null, 2), 'utf8');
}

function linkDir(sourceDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (!fs.existsSync(sourceDir)) return;
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const src = path.join(sourceDir, entry.name);
    const dst = path.join(destDir, entry.name);
    try {
      if (fs.existsSync(dst) || fs.existsSync(dst)) continue;
      if (entry.isDirectory()) fs.symlinkSync(src, dst, 'dir');
    } catch { /* skip */ }
  }
}

/**
 * Run the discovery: scan sources, write INDEX.md + INDEX.json, create symlink
 * dirs so the JEV hub is a self-contained view.
 * `onStep` callback (optional): (label, pct) fired per phase for UI progress.
 */
export function buildSkillsHub(onStep = null) {
  const step = (label, pct) => { if (onStep) onStep(label, pct); };

  step('Varrendo skills do Claude Code', 10);
  const skills = collectSkills();

  step('Varrendo MCP servers', 45);
  const mcp = collectMcp();

  step('Varrendo tools/plugins', 60);
  const tools = collectTools();

  step('Escrevendo INDEX.md + INDEX.json', 80);
  const data = { generatedAt: new Date().toISOString(), skills, mcp, tools };
  writeIndexMarkdown(data);
  writeIndexJson(data);

  step('Criando links no hub', 95);
  linkDir(JEV_REPO_SKILLS, SKILLS_LINK_DIR);
  fs.mkdirSync(MCP_LINK_DIR, { recursive: true });
  fs.mkdirSync(TOOLS_LINK_DIR, { recursive: true });

  step('Pronto', 100);
  return data;
}

/**
 * Read the hub catalog (INDEX.json), cheap.
 */
export function readSkillsHub() {
  try {
    return JSON.parse(fs.readFileSync(INDEX_JSON, 'utf8'));
  } catch {
    return null;
  }
}

if (process.argv[1] && process.argv[1].endsWith('skills-hub.js')) {
  const data = buildSkillsHub();
  console.log(`JEV Skills Hub: ${data.skills.length} skills, ${data.mcp.length} MCP, ${data.tools.length} tools -> ${HUB_DIR}`);
}