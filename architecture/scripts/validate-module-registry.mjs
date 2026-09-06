#!/usr/bin/env node
/**
 * SynqDrive central module registry validator.
 * Dependency-free: Node.js standard library only.
 *
 * Usage:
 *   node architecture/scripts/validate-module-registry.mjs
 *   node architecture/scripts/validate-module-registry.mjs --self-test
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const VALID_STATUSES = new Set([
  'NOT_STARTED',
  'AUDIT_IN_PROGRESS',
  'AUTHORITY_ACTIVE',
  'SUPERSEDED',
]);

const REQUIRED_COLUMNS = [
  'Module',
  'Mini description',
  'Registry status',
  'Authority-native status',
  'Authority path',
];

const OVERVIEW_HEADING = '## Module inventory overview';

function findRepoRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  while (true) {
    const agents = path.join(dir, 'AGENTS.md');
    const registry = path.join(dir, 'architecture', 'SYNQDRIVE_RENTAL_ARCHITECTURE.md');
    if (fs.existsSync(agents) && fs.existsSync(registry)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate repository root (AGENTS.md + architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md)');
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function extractBacktickStatus(cell) {
  const m = cell.match(/`([^`]+)`/);
  return m ? m[1].trim() : cell.trim();
}

function parseMarkdownTableAfterHeading(content, heading) {
  const idx = content.indexOf(heading);
  if (idx === -1) return null;
  const after = content.slice(idx + heading.length);
  const lines = after.split('\n');
  const tableLines = [];
  let started = false;
  for (const line of lines) {
    if (line.trim().startsWith('|')) {
      started = true;
      tableLines.push(line);
    } else if (started) {
      break;
    }
  }
  if (tableLines.length < 2) return null;
  const headerCells = splitTableRow(tableLines[0]);
  const rows = [];
  for (let i = 2; i < tableLines.length; i++) {
    const cells = splitTableRow(tableLines[i]);
    if (cells.length === 0) continue;
    const row = {};
    headerCells.forEach((h, j) => {
      row[h] = cells[j] ?? '';
    });
    rows.push(row);
  }
  return { headerCells, rows };
}

function splitTableRow(line) {
  const parts = line.split('|');
  if (parts.length < 2) return [];
  return parts.slice(1, -1).map((c) => c.trim());
}

function extractAuthorityPath(cell, registryDir) {
  const trimmed = cell.trim();
  if (!trimmed || trimmed === '—' || trimmed === '-' || /^N\/A/i.test(trimmed)) return null;
  const link = trimmed.match(/\]\(([^)]+)\)/);
  const target = link ? link[1].split('#')[0].trim() : trimmed.replace(/^`+|`+$/g, '');
  if (!target || target === '—') return null;
  const resolved = path.resolve(registryDir, target);
  return { raw: target, resolved, display: target.replace(/\/$/, '') + '/' };
}

function parseDetailSections(content) {
  const sections = [];
  const re = /^### (.+)$/gm;
  let match;
  while ((match = re.exec(content)) !== null) {
    const title = match[1].trim();
    const start = match.index;
    const next = content.indexOf('\n### ', start + 4);
    const body = next === -1 ? content.slice(start) : content.slice(start, next);
    sections.push({ title, body });
  }
  return sections;
}

function findDetailSectionForModule(moduleName, sections) {
  const base = moduleName.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return sections.find((s) => s.title === moduleName || s.title.startsWith(moduleName) || s.title.startsWith(base));
}

function extractDetailField(body, fieldName) {
  const re = new RegExp(`\\*\\*${fieldName}\\*\\*\\s*\\|\\s*([^\\n|]+)`, 'i');
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function extractMandatoryEntryLinks(body, registryDir) {
  const m = body.match(/\*\*Mandatory entry documents\*\*\s*\|\s*([^\n]+)/i);
  if (!m) return [];
  const links = [];
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let lm;
  while ((lm = re.exec(m[1])) !== null) {
    links.push(lm[1].split('#')[0].trim());
  }
  return links;
}

function resolveRegistryLinks(content, registryDir, errors, label) {
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const target = m[1].split('#')[0].trim();
    if (!target || target.startsWith('http')) continue;
    const resolved = path.resolve(registryDir, target);
    if (!fs.existsSync(resolved)) {
      errors.push(`${label}: broken relative link -> ${target}`);
    }
  }
}

function isAuthorityRoot(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
  const markers = [
    path.join(dir, 'graph', 'nodes.yaml'),
    path.join(dir, 'AGENT_CONTRACT.md'),
    path.join(dir, 'AGENT_MAINTENANCE_POLICY.md'),
    path.join(dir, 'GRAPH.yaml'),
    path.join(dir, 'governance', 'AGENT_PROTOCOL.md'),
  ];
  if (markers.some((p) => fs.existsSync(p))) return true;
  const readme = path.join(dir, 'README.md');
  if (fs.existsSync(readme)) {
    const t = readUtf8(readme);
    if (/Living Architecture Authority|Canonical Knowledge Graph|repository-native knowledge authority/i.test(t)) {
      return true;
    }
  }
  return false;
}

function discoverAuthorityRoots(repoRoot) {
  const roots = new Set();
  const archDir = path.join(repoRoot, 'architecture');
  for (const name of fs.readdirSync(archDir)) {
    if (name === 'scripts' || name === 'knowledge-graphs') continue;
    const full = path.join(archDir, name);
    if (fs.statSync(full).isDirectory() && isAuthorityRoot(full)) {
      roots.add(`architecture/${name}/`);
    }
  }
  const kgDir = path.join(archDir, 'knowledge-graphs');
  if (fs.existsSync(kgDir)) {
    for (const name of fs.readdirSync(kgDir)) {
      if (name === 'discovery') continue;
      const full = path.join(kgDir, name);
      if (fs.statSync(full).isDirectory() && isAuthorityRoot(full)) {
        roots.add(`architecture/knowledge-graphs/${name}/`);
      }
    }
  }
  return [...roots].sort();
}

function normalizeAuthorityPath(p) {
  let s = p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (!s.startsWith('architecture/')) {
    s = `architecture/${s.replace(/^\/+/, '')}`;
  }
  return `${s}/`;
}

function hasSuccessorPointer(moduleName, overviewRow, detailBody) {
  const hay = `${overviewRow['Mini description']} ${detailBody ?? ''}`;
  return /successor/i.test(hay) && /→|->|follow|see \[/i.test(hay);
}

function validateRegistryAt(repoRoot, options = {}) {
  const errors = [];
  const registryPath = path.join(repoRoot, 'architecture', 'SYNQDRIVE_RENTAL_ARCHITECTURE.md');
  const registryDir = path.dirname(registryPath);
  const content = readUtf8(registryPath);

  if (!content.includes(OVERVIEW_HEADING)) {
    errors.push(`Missing heading: ${OVERVIEW_HEADING}`);
    return errors;
  }

  const table = parseMarkdownTableAfterHeading(content, OVERVIEW_HEADING);
  if (!table) {
    errors.push('Could not parse module inventory overview table');
    return errors;
  }

  for (const col of REQUIRED_COLUMNS) {
    if (!table.headerCells.includes(col)) {
      errors.push(`Overview table missing required column: ${col}`);
    }
  }

  const detailSections = parseDetailSections(content);
  const moduleNames = [];
  const pathsSeen = new Map();

  for (const row of table.rows) {
    const moduleName = row.Module?.trim();
    const mini = row['Mini description']?.trim();
    const status = extractBacktickStatus(row['Registry status'] ?? '');
    const nativeStatus = row['Authority-native status']?.trim() ?? '';
    const pathCell = row['Authority path'] ?? '';

    if (!moduleName) errors.push('Overview row missing module name');
    if (!mini) errors.push(`Overview row "${moduleName || '(unknown)'}" missing mini description`);
    if (!status) errors.push(`Overview row "${moduleName || '(unknown)'}" missing registry status`);

    if (status && !VALID_STATUSES.has(status)) {
      errors.push(`Overview row "${moduleName}": invalid registry status "${status}"`);
    }

    if (moduleName) {
      if (moduleNames.includes(moduleName)) {
        errors.push(`Duplicate module name in overview: ${moduleName}`);
      }
      moduleNames.push(moduleName);
    }

    const pathInfo = extractAuthorityPath(pathCell, registryDir);
    if (pathInfo) {
      const norm = normalizeAuthorityPath(pathInfo.display);
      if (pathsSeen.has(norm) && pathsSeen.get(norm) !== moduleName) {
        errors.push(`Duplicate authority path ${norm} for modules ${pathsSeen.get(norm)} and ${moduleName}`);
      }
      pathsSeen.set(norm, moduleName);
      if (!fs.existsSync(pathInfo.resolved)) {
        errors.push(`Overview row "${moduleName}": authority path does not exist -> ${pathInfo.raw}`);
      }
    }

    const detail = moduleName ? findDetailSectionForModule(moduleName, detailSections) : null;

    if (status === 'AUTHORITY_ACTIVE') {
      if (!pathInfo) errors.push(`AUTHORITY_ACTIVE row "${moduleName}" missing valid authority path`);
      if (!nativeStatus || nativeStatus === '—') {
        errors.push(`AUTHORITY_ACTIVE row "${moduleName}" missing authority-native status`);
      }
      if (!detail) {
        errors.push(`AUTHORITY_ACTIVE row "${moduleName}" missing corresponding detailed authority section`);
      } else {
        const detailStatus = extractDetailField(detail.body, 'Registry coverage status');
        const detailStatusVal = detailStatus ? extractBacktickStatus(detailStatus) : null;
        if (detailStatusVal !== 'AUTHORITY_ACTIVE') {
          errors.push(
            `Status mismatch for "${moduleName}": overview AUTHORITY_ACTIVE but detail has "${detailStatusVal ?? 'missing'}"`,
          );
        }
        const entryLinks = extractMandatoryEntryLinks(detail.body, registryDir);
        if (entryLinks.length === 0) {
          errors.push(`AUTHORITY_ACTIVE row "${moduleName}" has no mandatory entry document links in detail section`);
        }
        for (const link of entryLinks) {
          const resolved = path.resolve(registryDir, link);
          if (!fs.existsSync(resolved)) {
            errors.push(`AUTHORITY_ACTIVE row "${moduleName}": mandatory entry link missing -> ${link}`);
          }
        }
      }
    }

    if (status === 'AUDIT_IN_PROGRESS' && pathInfo && !fs.existsSync(pathInfo.resolved)) {
      errors.push(`AUDIT_IN_PROGRESS row "${moduleName}": declared authority path does not exist -> ${pathInfo.raw}`);
    }

    if (status === 'NOT_STARTED') {
      if (pathInfo && fs.existsSync(pathInfo.resolved)) {
        errors.push(
          `NOT_STARTED row "${moduleName}" declares an existing authority path; use AUDIT_IN_PROGRESS or AUTHORITY_ACTIVE`,
        );
      }
    }

    if (status === 'SUPERSEDED' && !hasSuccessorPointer(moduleName, row, detail?.body)) {
      errors.push(`SUPERSEDED row "${moduleName}" missing explicit successor pointer`);
    }
  }

  const sorted = [...moduleNames].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  if (JSON.stringify(moduleNames) !== JSON.stringify(sorted)) {
    errors.push(`Overview modules not alphabetically sorted. Expected: ${sorted.join(', ')}; got: ${moduleNames.join(', ')}`);
  }

  resolveRegistryLinks(content, registryDir, errors, 'SYNQDRIVE_RENTAL_ARCHITECTURE.md');

  const discovered = discoverAuthorityRoots(repoRoot);
  const registeredPaths = new Set(
    table.rows
      .map((r) => extractAuthorityPath(r['Authority path'] ?? '', registryDir))
      .filter(Boolean)
      .map((p) => normalizeAuthorityPath(p.display)),
  );
  for (const root of discovered) {
    const norm = normalizeAuthorityPath(root);
    if (!registeredPaths.has(norm)) {
      errors.push(`Discovered authority root not represented in registry overview: ${root}`);
    }
  }

  const agentsPath = path.join(repoRoot, 'AGENTS.md');
  const agents = readUtf8(agentsPath);
  if (!/SYNQDRIVE_RENTAL_ARCHITECTURE\.md/.test(agents)) {
    errors.push('AGENTS.md does not reference architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md');
  }
  if (!/MODULE_AUTHORITY_STANDARD\.md/.test(agents)) {
    errors.push('AGENTS.md does not reference architecture/MODULE_AUTHORITY_STANDARD.md');
  }

  const rulePath = path.join(repoRoot, '.cursor', 'rules', 'Architectur-Updates.mdc');
  if (!fs.existsSync(rulePath)) {
    errors.push('Missing .cursor/rules/Architectur-Updates.mdc');
  } else {
    const rule = readUtf8(rulePath);
    const fmMatches = rule.match(/^---\n[\s\S]*?\n---/g) ?? [];
    if (fmMatches.length !== 1) {
      errors.push('.cursor/rules/Architectur-Updates.mdc must have exactly one frontmatter block');
    } else if (!/alwaysApply:\s*true/.test(fmMatches[0])) {
      errors.push('.cursor/rules/Architectur-Updates.mdc frontmatter must contain alwaysApply: true');
    }
    if (!/SYNQDRIVE_RENTAL_ARCHITECTURE\.md/.test(rule)) {
      errors.push('.cursor/rules/Architectur-Updates.mdc does not reference the central registry');
    }
    if (!/UPDATED/.test(rule) || !/UNCHANGED/.test(rule)) {
      errors.push('.cursor/rules/Architectur-Updates.mdc must require UPDATED or UNCHANGED registry review results');
    }
    if (!/validate-module-registry/.test(rule)) {
      errors.push('.cursor/rules/Architectur-Updates.mdc must require the central registry validator');
    }
  }

  if (options.expectErrors) {
    const unmatched = options.expectErrors.filter((e) => !errors.some((err) => err.includes(e)));
    if (unmatched.length) {
      errors.push(`Self-test expected errors not found: ${unmatched.join('; ')}`);
    }
    if (options.expectErrors.length === 0 && errors.length > 0) {
      errors.push(`Self-test expected success but got errors: ${errors.join('; ')}`);
    }
  }

  return errors;
}

function runSelfTests() {
  const cases = [];
  let passed = 0;
  let failed = 0;

  function runCase(name, fn) {
    cases.push({ name, fn });
  }

  const repoRoot = findRepoRoot(path.dirname(__filename));
  runCase('valid registry (repository)', () => {
    const errors = validateRegistryAt(repoRoot);
    if (errors.length) throw new Error(errors.join('\n'));
  });

  runCase('missing mini description', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      const arch = path.join(dir, 'architecture');
      fs.mkdirSync(arch, { recursive: true });
      fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# AGENTS\n[SYNQDRIVE_RENTAL_ARCHITECTURE.md](architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md)\n[MODULE_AUTHORITY_STANDARD.md](architecture/MODULE_AUTHORITY_STANDARD.md)\n');
      fs.writeFileSync(
        path.join(arch, 'SYNQDRIVE_RENTAL_ARCHITECTURE.md'),
        `${OVERVIEW_HEADING}\n\n| Module | Mini description | Registry status | Authority-native status | Authority path |\n|--------|------------------|-----------------|-------------------------|----------------|\n| Alpha |  | \`NOT_STARTED\` | N/A | — |\n`,
      );
      fs.mkdirSync(path.join(dir, '.cursor', 'rules'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'),
        '---\nalwaysApply: true\n---\nSYNQDRIVE_RENTAL_ARCHITECTURE.md UPDATED UNCHANGED validate-module-registry\n',
      );
      const errors = validateRegistryAt(dir);
      if (!errors.some((e) => e.includes('missing mini description'))) {
        throw new Error(`Expected missing mini description error, got: ${errors.join('; ')}`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  runCase('invalid status', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      const arch = path.join(dir, 'architecture');
      fs.mkdirSync(arch, { recursive: true });
      fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# AGENTS\narchitecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md\narchitecture/MODULE_AUTHORITY_STANDARD.md\n');
      fs.writeFileSync(
        path.join(arch, 'SYNQDRIVE_RENTAL_ARCHITECTURE.md'),
        `${OVERVIEW_HEADING}\n\n| Module | Mini description | Registry status | Authority-native status | Authority path |\n|--------|------------------|-----------------|-------------------------|----------------|\n| Alpha | Desc | \`BOGUS\` | N/A | — |\n`,
      );
      fs.mkdirSync(path.join(dir, '.cursor', 'rules'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'),
        '---\nalwaysApply: true\n---\nSYNQDRIVE_RENTAL_ARCHITECTURE.md UPDATED UNCHANGED validate-module-registry\n',
      );
      const errors = validateRegistryAt(dir);
      if (!errors.some((e) => e.includes('invalid registry status'))) {
        throw new Error(`Expected invalid status error, got: ${errors.join('; ')}`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  runCase('duplicate module', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      const arch = path.join(dir, 'architecture');
      fs.mkdirSync(arch, { recursive: true });
      fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# AGENTS\nSYNQDRIVE_RENTAL_ARCHITECTURE.md MODULE_AUTHORITY_STANDARD.md\n');
      fs.writeFileSync(
        path.join(arch, 'SYNQDRIVE_RENTAL_ARCHITECTURE.md'),
        `${OVERVIEW_HEADING}\n\n| Module | Mini description | Registry status | Authority-native status | Authority path |\n|--------|------------------|-----------------|-------------------------|----------------|\n| Alpha | A | \`NOT_STARTED\` | N/A | — |\n| Alpha | B | \`NOT_STARTED\` | N/A | — |\n`,
      );
      fs.mkdirSync(path.join(dir, '.cursor', 'rules'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'),
        '---\nalwaysApply: true\n---\nSYNQDRIVE_RENTAL_ARCHITECTURE.md UPDATED UNCHANGED validate-module-registry\n',
      );
      const errors = validateRegistryAt(dir);
      if (!errors.some((e) => e.includes('Duplicate module name'))) {
        throw new Error(`Expected duplicate module error, got: ${errors.join('; ')}`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  runCase('unsorted modules', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      const arch = path.join(dir, 'architecture');
      fs.mkdirSync(arch, { recursive: true });
      fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# AGENTS\nSYNQDRIVE_RENTAL_ARCHITECTURE.md MODULE_AUTHORITY_STANDARD.md\n');
      fs.writeFileSync(
        path.join(arch, 'SYNQDRIVE_RENTAL_ARCHITECTURE.md'),
        `${OVERVIEW_HEADING}\n\n| Module | Mini description | Registry status | Authority-native status | Authority path |\n|--------|------------------|-----------------|-------------------------|----------------|\n| Zulu | Z | \`NOT_STARTED\` | N/A | — |\n| Alpha | A | \`NOT_STARTED\` | N/A | — |\n`,
      );
      fs.mkdirSync(path.join(dir, '.cursor', 'rules'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'),
        '---\nalwaysApply: true\n---\nSYNQDRIVE_RENTAL_ARCHITECTURE.md UPDATED UNCHANGED validate-module-registry\n',
      );
      const errors = validateRegistryAt(dir);
      if (!errors.some((e) => e.includes('not alphabetically sorted'))) {
        throw new Error(`Expected unsorted modules error, got: ${errors.join('; ')}`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  runCase('missing active authority path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      const arch = path.join(dir, 'architecture');
      fs.mkdirSync(arch, { recursive: true });
      fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# AGENTS\nSYNQDRIVE_RENTAL_ARCHITECTURE.md MODULE_AUTHORITY_STANDARD.md\n');
      fs.writeFileSync(
        path.join(arch, 'SYNQDRIVE_RENTAL_ARCHITECTURE.md'),
        `${OVERVIEW_HEADING}\n\n| Module | Mini description | Registry status | Authority-native status | Authority path |\n|--------|------------------|-----------------|-------------------------|----------------|\n| Alpha | A | \`AUTHORITY_ACTIVE\` | Native | — |\n\n### Alpha\n\n| Field | Value |\n| **Registry coverage status** | \`AUTHORITY_ACTIVE\` |\n| **Mandatory entry documents** | [README.md](alpha/README.md) |\n`,
      );
      fs.mkdirSync(path.join(dir, '.cursor', 'rules'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'),
        '---\nalwaysApply: true\n---\nSYNQDRIVE_RENTAL_ARCHITECTURE.md UPDATED UNCHANGED validate-module-registry\n',
      );
      const errors = validateRegistryAt(dir);
      if (!errors.some((e) => e.includes('missing valid authority path'))) {
        throw new Error(`Expected missing authority path error, got: ${errors.join('; ')}`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  runCase('active row/detail status mismatch', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      const arch = path.join(dir, 'architecture');
      const mod = path.join(arch, 'alpha');
      fs.mkdirSync(mod, { recursive: true });
      fs.writeFileSync(path.join(mod, 'README.md'), '# Living Architecture Authority\n');
      fs.writeFileSync(path.join(mod, 'AGENT_CONTRACT.md'), '# contract\n');
      fs.writeFileSync(path.join(mod, 'README.md'), '# Living Architecture Authority\n');
      fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# AGENTS\nSYNQDRIVE_RENTAL_ARCHITECTURE.md MODULE_AUTHORITY_STANDARD.md\n');
      fs.writeFileSync(
        path.join(arch, 'SYNQDRIVE_RENTAL_ARCHITECTURE.md'),
        `${OVERVIEW_HEADING}\n\n| Module | Mini description | Registry status | Authority-native status | Authority path |\n|--------|------------------|-----------------|-------------------------|----------------|\n| Alpha | A | \`AUTHORITY_ACTIVE\` | Native | [alpha/](alpha/) |\n\n### Alpha\n\n| Field | Value |\n| **Registry coverage status** | \`AUDIT_IN_PROGRESS\` |\n| **Mandatory entry documents** | [README.md](alpha/README.md) |\n`,
      );
      fs.mkdirSync(path.join(dir, '.cursor', 'rules'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'),
        '---\nalwaysApply: true\n---\nSYNQDRIVE_RENTAL_ARCHITECTURE.md UPDATED UNCHANGED validate-module-registry\n',
      );
      const errors = validateRegistryAt(dir);
      if (!errors.some((e) => e.includes('Status mismatch'))) {
        throw new Error(`Expected status mismatch error, got: ${errors.join('; ')}`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  runCase('missing successor for SUPERSEDED', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      const arch = path.join(dir, 'architecture');
      fs.mkdirSync(arch, { recursive: true });
      fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# AGENTS\nSYNQDRIVE_RENTAL_ARCHITECTURE.md MODULE_AUTHORITY_STANDARD.md\n');
      fs.writeFileSync(
        path.join(arch, 'SYNQDRIVE_RENTAL_ARCHITECTURE.md'),
        `${OVERVIEW_HEADING}\n\n| Module | Mini description | Registry status | Authority-native status | Authority path |\n|--------|------------------|-----------------|-------------------------|----------------|\n| Alpha | A | \`SUPERSEDED\` | Old | — |\n`,
      );
      fs.mkdirSync(path.join(dir, '.cursor', 'rules'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'),
        '---\nalwaysApply: true\n---\nSYNQDRIVE_RENTAL_ARCHITECTURE.md UPDATED UNCHANGED validate-module-registry\n',
      );
      const errors = validateRegistryAt(dir);
      if (!errors.some((e) => e.includes('missing explicit successor pointer'))) {
        throw new Error(`Expected missing successor error, got: ${errors.join('; ')}`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  for (const { name, fn } of cases) {
    try {
      fn();
      passed += 1;
      console.log(`  OK  ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`  FAIL ${name}: ${err.message}`);
    }
  }

  console.log(`\nSelf-tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

function main() {
  if (process.argv.includes('--self-test')) {
    console.log('==> Central registry validator self-tests');
    runSelfTests();
    return;
  }

  const repoRoot = findRepoRoot();
  const errors = validateRegistryAt(repoRoot);
  if (errors.length) {
    console.error('Central module registry validation FAILED:\n');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const table = parseMarkdownTableAfterHeading(
    readUtf8(path.join(repoRoot, 'architecture', 'SYNQDRIVE_RENTAL_ARCHITECTURE.md')),
    OVERVIEW_HEADING,
  );
  const active = (table?.rows ?? []).filter((r) => extractBacktickStatus(r['Registry status'] ?? '') === 'AUTHORITY_ACTIVE');
  console.log('Central module registry validation passed.');
  console.log(`  modules inventoried: ${table?.rows.length ?? 0}`);
  console.log(`  AUTHORITY_ACTIVE: ${active.length}`);
  console.log(`  authority roots discovered: ${discoverAuthorityRoots(repoRoot).length}`);
}

main();
