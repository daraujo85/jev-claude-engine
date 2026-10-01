#!/usr/bin/env node
/**
 * JEV Project Profile — scan a repo and emit .claude/jev-profile.md
 * describing the architecture, layers, code style and test conventions.
 * Subagents read this before writing code so new work stays coherent.
 *
 * Usage: node scripts/jev-profile.js [dir] [--json]
 *
 * Detection is heuristic and file-based (no dependency on a language
 * toolchain). It reads config/manifest files, scans folder structure and
 * samples source files for style markers. Output is a compact Markdown
 * profile tuned for LLM consumption.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, basename, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname as pathDirname } from 'node:path';

const __dirname = pathDirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2] || process.cwd();
const AS_JSON = process.argv.includes('--json');

const MAX_DIR_DEPTH = 12;
const MAX_SOURCE_SAMPLES = 40;

function walk(dir, depth = 0, acc = []) {
  if (depth > MAX_DIR_DEPTH) return acc;
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'vendor' || e.name === 'dist' || e.name === 'build' ||
        e.name === '.venv' || e.name === 'graphify-out' || e.name === '__pycache__' || e.name === '.tox' ||
        e.name === '.mypy_cache' || e.name === '.dart_tool' || e.name === 'Pods' || e.name === '.next' ||
        e.name === '.nuxt' || e.name === 'coverage' || e.name === 'target' || e.name === '.gradle') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      // Java/Maven/Gradle: inside src/main/java (or src/test/java) reset the
      // depth so deep package trees (br/com/x/domain/...) are fully walked.
      const rel = full.slice(dir.length).replace(/^[\\/]/, '');
      const isJavaRoot = /^src[\\/](main|test)[\\/]java$/.test(rel);
      walk(full, isJavaRoot ? 0 : depth + 1, acc);
    }
    else acc.push(full);
  }
  return acc;
}

// Sample source files spread across directories, not just the first N in
// walk order (which tends to cluster on one folder).
function sampleFiles(files, n) {
  if (files.length <= n) return files;
  const out = [];
  const bucket = Math.max(1, Math.floor(files.length / n));
  for (let i = 0; i < files.length && out.length < n; i += bucket) {
    out.push(files[i]);
  }
  return out.length < n ? files.slice(0, n) : out;
}

function readIfExists(p) {
  try { return readFileSync(p, 'utf8'); } catch { return null; }
}

function detectStack(root) {
  const stack = [];
  const markers = [];
  // find the root-most package.json (project root or a single sub-folder
  // like backend/), so monorepos/vanilla-front+node-back still detect stack.
  const pkgJsonCandidates = [join(root, 'package.json'),
    ...walk(root).filter(f => /[\\/]package\.json$/.test(f)).slice(0, 2)];
  const pkgPath = pkgJsonCandidates.find(existsSync);
  if (pkgPath) {
    const pkg = readIfExists(pkgPath);
    try {
      const j = JSON.parse(pkg);
      const deps = { ...(j.dependencies || {}), ...(j.devDependencies || {}) };
      // exact package match: dep name is either exactly k, the unscoped part,
      // or the scope itself. Substring matching caused false positives
      // (lucide-vue-next → "next", postcss-nesting → "express").
      const has = (k) => Object.keys(deps).some(d => {
        if (d === k) return true;
        if (d.startsWith('@')) {
          const [scope, name] = d.split('/');
          return scope === '@' + k || name === k;
        }
        return false;
      });
      if (has('react')) stack.push('React');
      if (has('next')) stack.push('Next.js');
      if (has('vue')) stack.push('Vue');
      if (has('angular')) stack.push('Angular');
      if (has('primevue')) stack.push('PrimeVue');
      if (has('pinia')) stack.push('Pinia');
      if (has('tailwindcss')) stack.push('Tailwind CSS');
      if (has('vue-router') || has('react-router')) stack.push('Router');
      if (has('express') || has('fastify') || has('nest')) stack.push('Node/Express');
      if (has('typescript') || has('ts-node')) stack.push('TypeScript');
      if (has('jest')) stack.push('Jest');
      if (has('vitest')) stack.push('Vitest');
      if (has('eslint')) markers.push('ESLint');
      if (has('prettier')) markers.push('Prettier');
      if (has('eslint-config-airbnb')) markers.push('Airbnb style');
      if (has('eslint-config-standard')) markers.push('Standard style');
      stack.push(`node ${j.engines?.node ? 'v' + j.engines.node : ''}`.trim());
    } catch {}
  }
  for (const f of ['composer.json', 'pom.xml', 'build.gradle', 'Cargo.toml', 'go.mod', 'requirements.txt', 'pyproject.toml', 'Gemfile', '*.csproj', '*.sln', 'pubspec.yaml']) {
    if (existsSync(join(root, f)) || walk(root).some(p => basename(p) === f.replace('*', '') || basename(p).endsWith(f.replace('*', '')))) {
      if (f.includes('csproj') || f.includes('sln')) stack.push('.NET/C#');
      else if (f === 'composer.json') stack.push('PHP/Composer');
      else if (f === 'pom.xml') {
        stack.push('Java/Maven');
        const pomCandidates = [join(root, f), ...walk(root).filter(p => basename(p) === 'pom.xml').slice(0, 2)];
        const pomPath = pomCandidates.find(existsSync);
        const pom = pomPath && readIfExists(pomPath);
        if (pom && /spring-boot-starter|spring-boot-maven-plugin/.test(pom)) stack.push('Spring Boot');
        else if (pom && /org\.springframework/.test(pom)) stack.push('Spring');
      }
      else if (f === 'Cargo.toml') stack.push('Rust');
      else if (f === 'go.mod') stack.push('Go');
      else if (f.includes('requirements') || f === 'pyproject.toml') stack.push('Python');
      else if (f === 'Gemfile') stack.push('Ruby');
      else if (f === 'pubspec.yaml') {
        stack.push('Flutter');
        const pub = readIfExists(join(root, f));
        if (pub && /sdk:\s*'>=?\d/.test(pub)) stack.push('Dart');
      }
    }
  }
  return { stack: [...new Set(stack)], markers };
}

const LAYER_NAMES = ['domain', 'application', 'app', 'infrastructure', 'infra', 'presentation', 'controllers', 'api', 'services', 'repositories', 'models', 'entities', 'config', 'core', 'shared', 'features', 'modules', 'ui', 'views', 'components', 'interfaces', 'contracts', 'migrations', 'tests', 'test', 'specs', 'ports', 'adapters', 'use-cases', 'handlers', 'queries', 'commands', 'routes', 'middlewares'];

function detectLayers(root, files) {
  const layers = new Set();
  for (const f of files) {
    const rel = f.startsWith(root) ? f.slice(root.length).split(sep).filter(Boolean) : f.split(sep).filter(Boolean);
    for (const seg of rel) {
      // exact package/dir segment match — not substring containment
      const s = seg.toLowerCase();
      if (LAYER_NAMES.includes(s)) {
        layers.add(seg);
      }
    }
    // Java: the declared package (e.g. `package br.com.x.domain;`) names the
    // layer exactly; use its final segment.
    if (f.endsWith('.java')) {
      const src = readIfExists(f);
      const m = src && src.match(/^\s*package\s+([\w.]+)\s*;/m);
      if (m) {
        const pkgSeg = m[1].split('.').pop().toLowerCase();
        if (LAYER_NAMES.includes(pkgSeg)) layers.add(m[1].split('.').pop());
      }
    }
  }
  return [...layers];
}

function detectPatterns(root, files) {
  const patterns = [];
  const allSrc = sampleFiles(files, MAX_SOURCE_SAMPLES).map(readIfExists).join('\n');
  const has = (re) => allSrc ? new RegExp(re, 'i').test(allSrc) : false;
  // Controller: require a word-boundary class/interface/annotation name.
  // Bare "Controller" matched AbortController in JS — false positive.
  if (has('class \\w*Controller\\b|@Controller\\b|interface \\w*Controller\\b')) patterns.push('MVC/Controllers');
  if (has('class \\w*Repository|interface.*Repository|extends Repository|@Repository')) patterns.push('Repository pattern');
  if (has('class \\w*Service|interface.*Service|@Service')) patterns.push('Service layer');
  if (has('CommandHandler|ICommandHandler|IMediator|CQRS|MediatR|CommandBus|QueryBus|bus\\.dispatch|bus\\.ask|use-cases/commands|use-cases/queries')) patterns.push('CQRS/Command-Query');
  if (has('abstract class|@abstract|Interface segregation')) patterns.push('OOP/abstractions');
  // React only when react is actually imported (useX() matches Vue composables too).
  if (has('from [\'"]react[\'"]|require\\([\'"]react[\'"]\\)|import [\'"]react[\'"]|extends React\\.Component')) patterns.push('React hooks/components');
  else if (has('React\\.Component')) patterns.push('React-style components');
  if (has('@Entity|@Table|@Column|\\.Model\\(')) patterns.push('ORM/Entities');
  if (has('@ApiOperation|@swagger|swagger|OpenAPI')) patterns.push('OpenAPI/Swagger');
  if (has('docker-compose|Dockerfile')) patterns.push('Docker');
  if (has('event\\(|emit\\(|subscribe\\(|EventEmitter')) patterns.push('Event-driven');
  if (has('@Inject|useInjection|get\\(|container\\.')) patterns.push('DI container');
  return patterns;
}

function detectTests(root, files) {
  const CODE_EXT = /\.(java|ts|tsx|js|jsx|py|go|cs|kt|rb|php)$/;
  const testFiles = files.filter(f => {
    const base = basename(f);
    const inTestDir = /[\\/](tests?|__tests__)[\\/]/.test(f);
    if (inTestDir) return CODE_EXT.test(f); // count only code files in test dirs (no .sql/.json fixtures)
    return /\.(test|spec)\./.test(base) || /Test\.java$/.test(base) || /^test_|_test\.|_tests\./.test(base) || base.includes('Tests');
  });
  const dirs = new Set(testFiles.map(f => dirname(f).split(sep).pop()));
  const javaTests = testFiles.filter(f => f.endsWith('.java'));
  const jsTests = testFiles.filter(f => /\.(ts|tsx|js|jsx)$/.test(f));
  let framework = '';
  if (javaTests.length > 0 && javaTests.length >= jsTests.length) {
    // majority Java → JUnit/TestNG
    const sample = javaTests.slice(0, 4).map(readIfExists).join('\n');
    framework = /org\.testng|@Test/.test(sample) ? 'JUnit/TestNG' : 'JUnit/TestNG';
  } else {
    const sample = testFiles.slice(0, 4).map(readIfExists).join('\n');
    if (/node:test|node:assert/.test(sample)) framework = 'node:test';
    else if (/\[Fact\]|\[Theory\]/.test(sample)) framework = 'xUnit/NUnit';
    else if (/def test_|class Test/.test(sample)) framework = 'pytest/unittest';
    else if (/it\(|describe\(|test\(/.test(sample)) framework = 'Jest/Vitest/Mocha (describe/it)';
    else framework = 'unclear';
  }
  return { count: testFiles.length, dirs: [...dirs].slice(0, 5), framework };
}

function detectStyle(root, files) {
  const src = sampleFiles(files.filter(f => /\.(ts|tsx|js|jsx|py|cs|java|go|rb|php)$/.test(f)), MAX_SOURCE_SAMPLES);
  const samples = src.map(readIfExists).filter(Boolean).join('\n');
  if (!samples) return {};
  const lines = samples.split('\n');
  const indented = lines.filter(l => /^    |^\t/.test(l));
  const style = {};
  style.indent = indented.length > 0 && /^\t/.test(indented[0]) ? 'tabs' : 'spaces';
  style.semicolons = lines.filter(l => /;\s*$/.test(l)).length > lines.filter(l => /\S+$/.test(l) && !/[{}\[\];\s]$/.test(l)).length / 2 ? 'yes' : 'no/unsure';
  style.singleQuotes = /'[^']*'/.test(samples) && !/"[^"]*"/.test(samples.slice(0, 2000));
  style.maxLine = Math.max(...lines.map(l => l.length), 0);
  style.naming = /[a-z][a-zA-Z0-9]*\(/.test(samples) ? 'camelCase' : (/([a-z_]+)\s*\(/.test(samples) ? 'snake_case' : 'unknown');
  return style;
}

function detectDesignSystem(root, files) {
  const uiFiles = files.filter(f => /\.(css|scss|sass|less|tsx|jsx|vue|ts|js)$/.test(f));
  const uiSamples = uiFiles.slice(0, 60).map(readIfExists).filter(Boolean).join('\n');
  const cssSamples = uiFiles.filter(f => /\.(css|scss|sass|less)$/.test(f)).map(readIfExists).filter(Boolean).join('\n');

  const ds = { hasDesignSystem: false, tokens: [], uiLib: [], components: [], icons: [], notes: [] };

  // CSS custom properties (design tokens) — the core signal.
  const tokenRegex = /--([a-z0-9-]+)\s*:/g;
  let m;
  const tokens = new Set();
  while ((m = tokenRegex.exec(cssSamples)) !== null) tokens.add(m[1]);
  if (tokens.size > 0) {
    ds.hasDesignSystem = true;
    const tokenList = [...tokens];
    ds.tokens = tokenList.slice(0, 30);
    const categories = new Set();
    for (const t of tokenList) {
      const cat = t.split('-')[0];
      if (['color', 'spacing', 'font', 'size', 'radius', 'shadow', 'zindex', 'breakpoint', 'border', 'transition', 'primary', 'secondary', 'surface', 'text', 'background'].includes(cat)) categories.add(cat);
    }
    if (categories.size) ds.notes.push(`token categories: ${[...categories].join(', ')}`);
  }

  // UI library / framework signals (Tailwind, MUI, shadcn, Chakra, Mantine...).
  const pkg = readIfExists(join(root, 'package.json'));
  const depStr = pkg || '';
  const libChecks = [
    ['tailwindcss', 'Tailwind'],
    ['@mui/', 'Material UI'],
    ['@radix-ui', 'Radix (shadcn-style)'],
    ['@chakra-ui', 'Chakra'],
    ['@mantine', 'Mantine'],
    ['bootstrap', 'Bootstrap'],
    ['antd', 'Ant Design'],
    ['@emotion', 'Emotion'],
    ['styled-components', 'styled-components'],
    ['@heroicons', 'Heroicons']
  ];
  for (const [k, label] of libChecks) {
    if (depStr.includes(k) || /className="[^"]*[a-z-]+:[a-z-]+/.test(uiSamples)) ds.uiLib.push(label);
  }
  if (/@layer|@tailwind\b/.test(cssSamples)) ds.uiLib.push('Tailwind (css)');

  // Reusable components defined in the codebase (excluding test/spec files).
  const compDirs = ['components', 'ui', 'widgets'];
  const compSet = new Set();
  for (const f of files) {
    const parts = f.split(sep);
    if (parts.some(p => compDirs.includes(p.toLowerCase())) && /\.(tsx|jsx|vue|ts|js)$/.test(f)) {
      const base = basename(f);
      if (/\.(test|spec)\.|\.test\.|\.spec\./.test(base)) continue;
      compSet.add(base.replace(/\.(tsx|jsx|vue|ts|js)$/, ''));
    }
  }
  if (compSet.size) {
    ds.hasDesignSystem = true;
    ds.components = [...compSet].slice(0, 25);
  }

  // Icon usage.
  const iconChecks = [
    ['lucide-react', 'lucide'],
    ['react-icons', 'react-icons'],
    ['@heroicons', 'heroicons'],
    ['@tabler/icons', 'tabler'],
    ['@fortawesome', 'fontawesome'],
    ['@mui/icons-material', 'mui-icons']
  ];
  for (const [k, label] of iconChecks) {
    if (depStr.includes(k)) ds.icons.push(label);
  }
  if (ds.icons.length === 0 && /<svg\b/.test(uiSamples)) ds.icons.push('inline SVG');

  return ds;
}

function buildProfile(root) {
  const files = walk(root);
  const stack = detectStack(root);
  const layers = detectLayers(root, files);
  const patterns = detectPatterns(root, files);
  const tests = detectTests(root, files);
  const style = detectStyle(root, files);
  const designSystem = detectDesignSystem(root, files);
  return { root, stack: stack.stack, markers: stack.markers, layers, patterns, tests, style, designSystem };
}

// Preserve hand-written sections from a previous profile. Blocks wrapped in
// <!-- jev-manual:start --> ... <!-- jev-manual:end --> survive regeneration
// (e.g. the LLM "Verified complement" with libraries/patterns the scan missed).
function readManualSections(root) {
  const p = join(root, '.claude', 'jev-profile.md');
  const prev = readIfExists(p);
  if (!prev) return '';
  const re = /<!-- jev-manual:start -->([\s\S]*?)<!-- jev-manual:end -->/g;
  const blocks = [];
  let m;
  while ((m = re.exec(prev)) !== null) {
    const body = m[1].trim();
    if (body) blocks.push('<!-- jev-manual:start -->\n' + body + '\n<!-- jev-manual:end -->');
  }
  return blocks.length ? '\n\n' + blocks.join('\n\n') : '';
}

// Read team rules from .claude/jev-rules.md (manual, non-detectable
// conventions: branch flow, comments policy, PR rules...) and embed them
// into the generated profile so subagents follow them too.
function readProjectRules(root) {
  const rulesPath = join(root, '.claude', 'jev-rules.md');
  const raw = readIfExists(rulesPath);
  if (!raw || !raw.trim()) return '';
  // strip any leading frontmatter
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  return body;
}

const profile = buildProfile(ROOT);

if (AS_JSON) {
  console.log(JSON.stringify(profile, null, 2));
} else {
  const md = `# Project profile: ${basename(ROOT)}

Auto-generated by JEV. Subagents: read this before writing code and follow
the conventions below so new work stays coherent with the codebase.

## Stack
- ${profile.stack.join('\n- ') || 'not detected'}

${profile.markers.length ? `## Tooling markers
- ${profile.markers.join('\n- ')}` : ''}

## Architecture layers (observed)
${profile.layers.length ? '- ' + profile.layers.join('\n- ') : '_none obvious — keep the existing folder structure_'}

## Patterns (observed)
${profile.patterns.length ? '- ' + profile.patterns.join('\n- ') : '_none obvious_'}

## Tests
- Count: ${profile.tests.count}
- Framework: ${profile.tests.framework}
${profile.tests.dirs.length ? '- Layout: ' + profile.tests.dirs.join(', ') : ''}

## Code style (sampled)
- Indentation: ${profile.style.indent || 'n/a'}
- Semicolons: ${profile.style.semicolons || 'n/a'}
- Max line length observed: ${profile.style.maxLine || 'n/a'}
- Naming: ${profile.style.naming || 'n/a'}

## Design system (front-end)
${profile.designSystem.hasDesignSystem
  ? (profile.designSystem.tokens.length
      ? '- Design tokens (CSS vars): `' + profile.designSystem.tokens.join('`, `') + '`\n'
      : '') +
    (profile.designSystem.uiLib.length
      ? '- UI library: ' + profile.designSystem.uiLib.join(', ') + '\n'
      : '') +
    (profile.designSystem.components.length
      ? '- Existing components: ' + profile.designSystem.components.join(', ') + '\n'
      : '') +
    (profile.designSystem.icons.length
      ? '- Icons: ' + profile.designSystem.icons.join(', ') + '\n'
      : '') +
    (profile.designSystem.notes.length
      ? '- Notes: ' + profile.designSystem.notes.join('; ')
      : '')
  : '_no design tokens/component library detected — for UI work, follow the closest existing styling (colors, spacing, fonts) seen in the code._'}

## Project rules (team conventions)
${(() => {
    const rules = readProjectRules(ROOT);
    if (rules) return rules;
    return '_none declared in .claude/jev-rules.md — if the team has branch/PR/comment conventions, add them there._';
  })()}

## Rule
Match the existing structure and style. Do not introduce a new folder layout,
a different test framework, or a different formatting style. For front-end:
use the design tokens, UI library and existing components above — never invent
colors, spacing or icons that are not already in the codebase. Extend what is
already here. Follow the project rules above.
${readManualSections(ROOT)}
`;
  const outPath = join(ROOT, '.claude', 'jev-profile.md');
  try { const { mkdirSync } = await import('node:fs'); mkdirSync(dirname(outPath), { recursive: true }); } catch {}
  const { writeFileSync } = await import('node:fs');
  writeFileSync(outPath, md);
  console.log(`Profile written: ${outPath}`);
  console.log(`Stack: ${profile.stack.join(', ') || 'n/a'} · Layers: ${profile.layers.length} · Tests: ${profile.tests.count} · Style: ${profile.style.indent}/${profile.style.naming}`);
}