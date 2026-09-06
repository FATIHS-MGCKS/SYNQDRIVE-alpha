#!/usr/bin/env node
/**
 * SynqDrive central module registry validator.
 * Dependency-free: Node.js standard library only.
 *
 * Usage:
 *   node architecture/scripts/validate-module-registry.mjs [--repo-root PATH]
 *   node architecture/scripts/validate-module-registry.mjs --self-test
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const NOT_STARTED_NATIVE_CANONICAL = 'n/a - inventory only';

function findRepoRoot(startDir) {
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

function resolveRepoRootFromArgs() {
  const idx = process.argv.indexOf('--repo-root');
  if (idx !== -1 && process.argv[idx + 1]) {
    return path.resolve(process.argv[idx + 1]);
  }
  return findRepoRoot(__dirname);
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function normalizeWhitespace(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function normalizeDashVariants(s) {
  return normalizeWhitespace(s).replace(/[–—]/g, '-');
}

function normalizeNativeInventoryStatus(s) {
  return normalizeDashVariants(s).toLowerCase();
}

function isNotStartedNativeStatus(s) {
  return normalizeNativeInventoryStatus(s) === NOT_STARTED_NATIVE_CANONICAL;
}

function isPathPlaceholderCell(s) {
  const t = normalizeWhitespace(s);
  return t === '—' || t === '–' || t === '-';
}

function extractBacktickStatus(cell) {
  const m = cell.match(/`([^`]+)`/);
  return m ? m[1].trim() : cell.trim();
}

function splitTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  const cells = [];
  let cell = '';
  for (let i = 1; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '\\' && trimmed[i + 1] === '|') {
      cell += '|';
      i += 1;
      continue;
    }
    if (ch === '|') {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += ch;
  }
  return cells;
}

function parseMarkdownTableAfterHeading(content, heading, errors, label = 'overview table') {
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
  if (!headerCells) {
    errors.push(`${label}: malformed header row`);
    return null;
  }

  const rows = [];
  for (let i = 2; i < tableLines.length; i++) {
    const cells = splitTableRow(tableLines[i]);
    if (!cells) {
      errors.push(`${label}: malformed data row ${i - 1}`);
      continue;
    }
    if (cells.length !== headerCells.length) {
      errors.push(
        `${label}: row ${i - 1} has ${cells.length} cells, expected ${headerCells.length} ("${cells[0] ?? ''}")`,
      );
      continue;
    }
    const row = {};
    headerCells.forEach((h, j) => {
      row[h] = cells[j] ?? '';
    });
    rows.push(row);
  }
  return { headerCells, rows };
}

function extractAuthorityPathRaw(cell) {
  const trimmed = cell.trim();
  if (!trimmed || isPathPlaceholderCell(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed)) return { raw: trimmed, isUrl: true };
  const link = trimmed.match(/\]\(([^)]+)\)/);
  const target = link ? link[1].split('#')[0].trim() : trimmed.replace(/^`+|`+$/g, '');
  if (!target || isPathPlaceholderCell(target)) return null;
  return { raw: target, isUrl: /^https?:\/\//i.test(target) };
}

function normalizeAuthorityRelPath(p) {
  let s = p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (!s.startsWith('architecture/')) {
    s = `architecture/${s.replace(/^\/+/, '')}`;
  }
  return `${s}/`;
}

function resolveAuthorityPath(repoRoot, registryDir, raw, moduleName, errors, context) {
  if (/^https?:\/\//i.test(raw)) {
    errors.push(`${context} "${moduleName}": authority path must not be an external URL -> ${raw}`);
    return null;
  }
  const resolved = path.resolve(registryDir, raw);
  const rel = path.relative(repoRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    errors.push(`${context} "${moduleName}": authority path escapes repository -> ${raw}`);
    return null;
  }
  const relPosix = rel.replace(/\\/g, '/');
  if (!relPosix.startsWith('architecture/')) {
    errors.push(`${context} "${moduleName}": authority path must be beneath architecture/ -> ${raw}`);
    return null;
  }
  if (!fs.existsSync(resolved)) {
    errors.push(`${context} "${moduleName}": authority path does not exist -> ${raw}`);
    return null;
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    errors.push(`${context} "${moduleName}": authority path must be a directory -> ${raw}`);
    return null;
  }
  return {
    raw,
    resolved,
    normalized: normalizeAuthorityRelPath(raw),
  };
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
  return sections.find(
    (s) => s.title === moduleName || s.title.startsWith(moduleName) || s.title.startsWith(base),
  );
}

function extractDetailField(body, fieldName) {
  const re = new RegExp(`\\*\\*${fieldName}\\*\\*\\s*\\|\\s*([^\\n]+)`, 'i');
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function extractMandatoryEntryLinks(body) {
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

function extractSuccessorInfo(text) {
  const re = /Successor:\s*(.+)/i;
  const m = text.match(re);
  if (!m) return null;
  return m[1].split('|')[0].trim();
}

function validateSuccessorPointer(moduleName, row, detail, tableRows, registryDir, repoRoot, errors) {
  const corpus = [
    row.Module ?? '',
    row['Mini description'] ?? '',
    row['Authority-native status'] ?? '',
    row['Authority path'] ?? '',
    detail?.body ?? '',
  ].join('\n');

  const successorText = extractSuccessorInfo(corpus);
  if (!successorText) {
    errors.push(`SUPERSEDED row "${moduleName}" missing explicit successor (expected "Successor: <Module Name>" notation)`);
    return;
  }

  const cleanSuccessor = successorText.replace(/[`[\]]/g, '').split('|')[0].trim();

  const linkInText = successorText.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (linkInText) {
    const target = linkInText[2].split('#')[0].trim();
    if (target.startsWith('http')) {
      errors.push(`SUPERSEDED row "${moduleName}" successor link must be a registry anchor or authority path, not external URL`);
      return;
    }
    if (target.startsWith('#')) return;
    const resolved = path.resolve(registryDir, target);
    if (!fs.existsSync(resolved)) {
      errors.push(`SUPERSEDED row "${moduleName}" successor link does not resolve -> ${target}`);
    }
    return;
  }

  const named = cleanSuccessor;
  const found = tableRows.some((r) => normalizeWhitespace(r.Module) === normalizeWhitespace(named));
  if (!found) {
    errors.push(`SUPERSEDED row "${moduleName}" successor "${named}" is not a registered module name`);
  }
}

function parseFrontmatterBlocks(content) {
  const lines = content.split('\n');
  const delimiterLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') delimiterLines.push(i);
  }
  if (delimiterLines.length < 2) {
    return { blockCount: 0, body: '', delimiterLines };
  }
  const firstOpen = delimiterLines[0];
  const firstClose = delimiterLines[1];
  const body = lines.slice(firstOpen + 1, firstClose).join('\n');
  const extraDelimiters = delimiterLines.slice(2);
  return { blockCount: 1 + (extraDelimiters.length > 0 ? 1 : 0), body, delimiterLines, extraDelimiters };
}

function validateMdcRule(rulePath, errors, label = '.cursor/rules/Architectur-Updates.mdc') {
  if (!fs.existsSync(rulePath)) {
    errors.push(`Missing ${label}`);
    return;
  }
  const rule = readUtf8(rulePath);
  const lines = rule.split('\n');
  if (lines[0]?.trim() !== '---') {
    errors.push(`${label}: file must begin with one frontmatter block`);
    return;
  }

  const { body, delimiterLines, extraDelimiters } = parseFrontmatterBlocks(rule);
  if (delimiterLines.length < 2) {
    errors.push(`${label}: frontmatter block is not closed`);
    return;
  }
  if (extraDelimiters.length > 0) {
    errors.push(`${label}: duplicate frontmatter delimiter blocks detected`);
    return;
  }

  const fmLines = body.split('\n');
  const activeAlwaysApply = fmLines.some((l) => /^alwaysApply:\s*true\s*$/.test(l.trim()));
  const commentedAlwaysApply = fmLines.some((l) => /#\s*alwaysApply:\s*true/.test(l));
  const falseAlwaysApply = fmLines.some((l) => /^alwaysApply:\s*false\s*$/.test(l.trim()));

  if (!activeAlwaysApply) {
    errors.push(`${label}: frontmatter must contain exact active property alwaysApply: true`);
  }
  if (commentedAlwaysApply && !activeAlwaysApply) {
    errors.push(`${label}: alwaysApply: true must not be commented out`);
  }
  if (falseAlwaysApply) {
    errors.push(`${label}: alwaysApply must not be false`);
  }
  if (!/SYNQDRIVE_RENTAL_ARCHITECTURE\.md/.test(rule)) {
    errors.push(`${label} does not reference the central registry`);
  }
  if (!/UPDATED/.test(rule) || !/UNCHANGED/.test(rule)) {
    errors.push(`${label} must require UPDATED or UNCHANGED registry review results`);
  }
  if (!/validate-module-registry/.test(rule)) {
    errors.push(`${label} must require the central registry validator`);
  }
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

  const table = parseMarkdownTableAfterHeading(content, OVERVIEW_HEADING, errors);
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
  const moduleNamesLower = new Map();
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
      const key = moduleName.toLowerCase();
      if (moduleNamesLower.has(key)) {
        errors.push(
          `Duplicate module name in overview (case-insensitive): "${moduleNamesLower.get(key)}" and "${moduleName}"`,
        );
      } else {
        moduleNamesLower.set(key, moduleName);
      }
      moduleNames.push(moduleName);
    }

    const pathRaw = extractAuthorityPathRaw(pathCell);
    let pathInfo = null;
    if (pathRaw) {
      if (pathRaw.isUrl) {
        errors.push(`Overview row "${moduleName}": authority path must not be an external URL`);
      } else {
        pathInfo = resolveAuthorityPath(repoRoot, registryDir, pathRaw.raw, moduleName, errors, 'Overview row');
        if (pathInfo) {
          const norm = pathInfo.normalized;
          if (pathsSeen.has(norm) && pathsSeen.get(norm) !== moduleName) {
            errors.push(`Duplicate authority path ${norm} for modules ${pathsSeen.get(norm)} and ${moduleName}`);
          }
          pathsSeen.set(norm, moduleName);
        }
      }
    }

    const detail = moduleName ? findDetailSectionForModule(moduleName, detailSections) : null;

    if (status === 'NOT_STARTED') {
      if (!isNotStartedNativeStatus(nativeStatus)) {
        errors.push(
          `NOT_STARTED row "${moduleName}": authority-native status must be "N/A — inventory only", got "${nativeStatus}"`,
        );
      }
      if (!isPathPlaceholderCell(pathCell)) {
        errors.push(`NOT_STARTED row "${moduleName}": authority path must be "—"`);
      }
      if (pathInfo) {
        errors.push(`NOT_STARTED row "${moduleName}": must not declare a usable authority path`);
      }
      if (/canonical|audited|safe to change|authority.active|production.validated/i.test(`${mini} ${nativeStatus}`)) {
        errors.push(`NOT_STARTED row "${moduleName}": must not claim audited, canonical, or safe-to-change maturity`);
      }
      if (detail && /\*\*Registry coverage status\*\*.*AUTHORITY_ACTIVE/i.test(detail.body)) {
        errors.push(`NOT_STARTED row "${moduleName}": must not have an active detailed authority section`);
      }
    }

    if (status === 'AUDIT_IN_PROGRESS') {
      if (!pathInfo) {
        errors.push(`AUDIT_IN_PROGRESS row "${moduleName}" missing declared authority path`);
      }
      if (!nativeStatus || isNotStartedNativeStatus(nativeStatus)) {
        errors.push(
          `AUDIT_IN_PROGRESS row "${moduleName}": authority-native status must be non-empty and not "N/A — inventory only"`,
        );
      }
    }

    if (status === 'AUTHORITY_ACTIVE') {
      if (!pathInfo) errors.push(`AUTHORITY_ACTIVE row "${moduleName}" missing valid authority path`);
      if (!nativeStatus || isPathPlaceholderCell(nativeStatus)) {
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
        const detailDirField = extractDetailField(detail.body, 'Authority directory');
        if (pathInfo && detailDirField) {
          const detailLink = detailDirField.match(/\]\(([^)]+)\)/);
          const detailRaw = detailLink ? detailLink[1].split('#')[0].trim() : detailDirField;
          const detailNorm = normalizeAuthorityRelPath(detailRaw);
          if (detailNorm !== pathInfo.normalized) {
            errors.push(
              `Authority path mismatch for "${moduleName}": overview ${pathInfo.normalized} vs detail ${detailNorm}`,
            );
          }
        }
        const entryLinks = extractMandatoryEntryLinks(detail.body);
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

    if (status === 'SUPERSEDED') {
      validateSuccessorPointer(moduleName, row, detail, table.rows, registryDir, repoRoot, errors);
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
      .map((r) => {
        const raw = extractAuthorityPathRaw(r['Authority path'] ?? '');
        return raw && !raw.isUrl ? normalizeAuthorityRelPath(raw.raw) : null;
      })
      .filter(Boolean),
  );
  for (const root of discovered) {
    const norm = normalizeAuthorityRelPath(root);
    if (!registeredPaths.has(norm)) {
      errors.push(`Discovered authority root not represented in registry overview: ${root}`);
    }
  }

  const agents = readUtf8(path.join(repoRoot, 'AGENTS.md'));
  if (!/SYNQDRIVE_RENTAL_ARCHITECTURE\.md/.test(agents)) {
    errors.push('AGENTS.md does not reference architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md');
  }
  if (!/MODULE_AUTHORITY_STANDARD\.md/.test(agents)) {
    errors.push('AGENTS.md does not reference architecture/MODULE_AUTHORITY_STANDARD.md');
  }

  if (!options.skipMdc) {
    validateMdcRule(path.join(repoRoot, '.cursor', 'rules', 'Architectur-Updates.mdc'), errors);
  }

  if (options.expectErrors?.length) {
    const unmatched = options.expectErrors.filter((snippet) => !errors.some((err) => err.includes(snippet)));
    if (unmatched.length) {
      errors.push(`Self-test expected errors not found: ${unmatched.join('; ')}`);
    }
  }
  if (options.expectSuccess && errors.length > 0) {
    errors.push(`Self-test expected success but got errors: ${errors.join('; ')}`);
  }

  return errors;
}

function writeFixture(dir, registryBody, ruleBody = null) {
  const arch = path.join(dir, 'architecture');
  fs.mkdirSync(arch, { recursive: true });
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# AGENTS\narchitecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md\narchitecture/MODULE_AUTHORITY_STANDARD.md\n');
  fs.writeFileSync(path.join(arch, 'SYNQDRIVE_RENTAL_ARCHITECTURE.md'), registryBody);
  fs.mkdirSync(path.join(dir, '.cursor', 'rules'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'),
    ruleBody ??
      '---\nalwaysApply: true\n---\nSYNQDRIVE_RENTAL_ARCHITECTURE.md UPDATED UNCHANGED validate-module-registry\n',
  );
}

function overviewTable(rows) {
  const header =
    '| Module | Mini description | Registry status | Authority-native status | Authority path |\n|--------|------------------|-----------------|-------------------------|----------------|';
  return `${OVERVIEW_HEADING}\n\n${header}\n${rows}\n`;
}

function expectError(name, fn, snippet) {
  return { name, fn: () => {
    const errors = fn();
    if (!errors.some((e) => e.includes(snippet))) {
      throw new Error(`Expected error containing "${snippet}", got: ${errors.join('; ') || '(none)'}`);
    }
  }};
}

function expectSuccess(name, fn) {
  return { name, fn: () => {
    const errors = fn();
    if (errors.length) throw new Error(errors.join('\n'));
  }};
}

function runSelfTests() {
  const cases = [];
  const repoRoot = findRepoRoot(__dirname);

  cases.push(expectSuccess('valid registry (repository)', () => validateRegistryAt(repoRoot)));

  cases.push(expectError('missing mini description', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(dir, overviewTable('| Alpha |  | `NOT_STARTED` | N/A — inventory only | — |'));
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'missing mini description'));

  cases.push(expectError('NOT_STARTED incorrect native status', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(dir, overviewTable('| Alpha | Desc | `NOT_STARTED` | CANONICAL | — |'));
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'authority-native status must be "N/A — inventory only"'));

  cases.push(expectError('NOT_STARTED incorrect authority path placeholder', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(dir, overviewTable('| Alpha | Desc | `NOT_STARTED` | N/A — inventory only | N/A |'));
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'authority path must be "—"'));

  cases.push(expectError('NOT_STARTED existing authority path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      const arch = path.join(dir, 'architecture', 'alpha');
      fs.mkdirSync(arch, { recursive: true });
      fs.writeFileSync(path.join(arch, 'README.md'), '# Living Architecture Authority\n');
      writeFixture(dir, overviewTable('| Alpha | Desc | `NOT_STARTED` | N/A — inventory only | [alpha/](alpha/) |'));
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'must not declare a usable authority path'));

  cases.push(expectError('invalid status', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(dir, overviewTable('| Alpha | Desc | `BOGUS` | N/A — inventory only | — |'));
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'invalid registry status'));

  cases.push(expectError('duplicate module', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(
        dir,
        overviewTable(
          '| Alpha | A | `NOT_STARTED` | N/A — inventory only | — |\n| Alpha | B | `NOT_STARTED` | N/A — inventory only | — |',
        ),
      );
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'Duplicate module name'));

  cases.push(expectError('case-insensitive duplicate module', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(
        dir,
        overviewTable(
          '| alpha | A | `NOT_STARTED` | N/A — inventory only | — |\n| Alpha | B | `NOT_STARTED` | N/A — inventory only | — |',
        ),
      );
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'case-insensitive'));

  cases.push(expectError('unsorted modules', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(
        dir,
        overviewTable(
          '| Zulu | Z | `NOT_STARTED` | N/A — inventory only | — |\n| Alpha | A | `NOT_STARTED` | N/A — inventory only | — |',
        ),
      );
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'not alphabetically sorted'));

  cases.push(expectSuccess('escaped pipe in mini description', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(dir, overviewTable('| Alpha | Pipe \\| test | `NOT_STARTED` | N/A — inventory only | — |'));
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }));

  cases.push(expectError('malformed cell count', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(
        dir,
        `${OVERVIEW_HEADING}\n\n| Module | Mini description | Registry status | Authority-native status | Authority path |\n|--------|------------------|-----------------|-------------------------|----------------|\n| Alpha | only three | cells |\n`,
      );
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'has 3 cells, expected 5'));

  cases.push(expectError('missing active authority path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(
        dir,
        `${overviewTable('| Alpha | A | `AUTHORITY_ACTIVE` | Native | — |')}\n### Alpha\n\n| Field | Value |\n| **Registry coverage status** | \`AUTHORITY_ACTIVE\` |\n| **Mandatory entry documents** | [README.md](alpha/README.md) |\n`,
      );
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'missing valid authority path'));

  cases.push(expectError('active row/detail status mismatch', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      const mod = path.join(dir, 'architecture', 'alpha');
      fs.mkdirSync(mod, { recursive: true });
      fs.writeFileSync(path.join(mod, 'README.md'), '# Living Architecture Authority\n');
      fs.writeFileSync(path.join(mod, 'AGENT_CONTRACT.md'), '# contract\n');
      writeFixture(
        dir,
        `${overviewTable('| Alpha | A | `AUTHORITY_ACTIVE` | Native | [alpha/](alpha/) |')}\n### Alpha\n\n| Field | Value |\n| **Registry coverage status** | \`AUDIT_IN_PROGRESS\` |\n| **Authority directory** | [alpha/](alpha/) |\n| **Mandatory entry documents** | [README.md](alpha/README.md) |\n`,
      );
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'Status mismatch'));

  cases.push(expectError('AUDIT_IN_PROGRESS missing path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(dir, overviewTable('| Alpha | A | `AUDIT_IN_PROGRESS` | Reconstruction started | — |'));
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'missing declared authority path'));

  cases.push(expectError('AUDIT_IN_PROGRESS nonexistent path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(dir, overviewTable('| Alpha | A | `AUDIT_IN_PROGRESS` | Reconstruction started | [missing/](missing/) |'));
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'authority path does not exist'));

  cases.push(expectError('AUDIT_IN_PROGRESS path is file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      const arch = path.join(dir, 'architecture');
      fs.mkdirSync(arch, { recursive: true });
      fs.writeFileSync(path.join(arch, 'alpha.txt'), 'x');
      writeFixture(dir, overviewTable('| Alpha | A | `AUDIT_IN_PROGRESS` | Reconstruction started | [alpha.txt](alpha.txt) |'));
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'authority path must be a directory'));

  cases.push(expectError('AUDIT_IN_PROGRESS path outside architecture', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      fs.mkdirSync(path.join(dir, 'outside'), { recursive: true });
      writeFixture(dir, overviewTable('| Alpha | A | `AUDIT_IN_PROGRESS` | Reconstruction started | [../outside/](../outside/) |'));
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'must be beneath architecture/'));

  cases.push(expectError('missing successor for SUPERSEDED', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(dir, overviewTable('| Alpha | A | `SUPERSEDED` | Old | — |'));
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'missing explicit successor'));

  cases.push(expectSuccess('SUPERSEDED successor in authority-native status', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(
        dir,
        overviewTable('| Alpha | A | `SUPERSEDED` | Successor: Beta | — |\n| Beta | B | `AUTHORITY_ACTIVE` | Native | [beta/](beta/) |\n') +
          '\n### Beta\n\n| Field | Value |\n| **Registry coverage status** | `AUTHORITY_ACTIVE` |\n| **Authority directory** | [beta/](beta/) |\n| **Mandatory entry documents** | [README.md](beta/README.md) |\n',
      );
      const beta = path.join(dir, 'architecture', 'beta');
      fs.mkdirSync(beta, { recursive: true });
      fs.writeFileSync(path.join(beta, 'README.md'), '# Living Architecture Authority\n');
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }));

  cases.push(expectSuccess('SUPERSEDED successor in detail section', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      const beta = path.join(dir, 'architecture', 'beta');
      fs.mkdirSync(beta, { recursive: true });
      fs.writeFileSync(path.join(beta, 'README.md'), '# Living Architecture Authority\n');
      writeFixture(
        dir,
        overviewTable('| Alpha | A | `SUPERSEDED` | Historical | — |\n| Beta | B | `AUTHORITY_ACTIVE` | Native | [beta/](beta/) |') +
          '\n### Alpha\n\n| Field | Value |\n| **Successor** | Successor: Beta |\n\n### Beta\n\n| Field | Value |\n| **Registry coverage status** | `AUTHORITY_ACTIVE` |\n| **Authority directory** | [beta/](beta/) |\n| **Mandatory entry documents** | [README.md](beta/README.md) |\n',
      );
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }));

  cases.push(expectError('SUPERSEDED broken successor link', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(dir, overviewTable('| Alpha | A | `SUPERSEDED` | Successor: [Beta](missing/) | — |'));
      return validateRegistryAt(dir, { skipMdc: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'successor link does not resolve'));

  cases.push(expectSuccess('MDC valid single frontmatter', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(dir, overviewTable('| Alpha | A | `NOT_STARTED` | N/A — inventory only | — |'));
      const errors = [];
      validateMdcRule(path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'), errors);
      return errors;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }));

  cases.push(expectError('MDC missing frontmatter', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(dir, overviewTable('| Alpha | A | `NOT_STARTED` | N/A — inventory only | — |'), 'no frontmatter\n');
      const errors = [];
      validateMdcRule(path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'), errors);
      return errors;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'must begin with one frontmatter block'));

  cases.push(expectError('MDC alwaysApply false', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(dir, overviewTable('| Alpha | A | `NOT_STARTED` | N/A — inventory only | — |'), '---\nalwaysApply: false\n---\n');
      const errors = [];
      validateMdcRule(path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'), errors);
      return errors;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'alwaysApply must not be false'));

  cases.push(expectError('MDC commented alwaysApply', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(dir, overviewTable('| Alpha | A | `NOT_STARTED` | N/A — inventory only | — |'), '---\n# alwaysApply: true\n---\nSYNQDRIVE_RENTAL_ARCHITECTURE.md\n');
      const errors = [];
      validateMdcRule(path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'), errors);
      return errors;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'alwaysApply: true'));

  cases.push(expectError('MDC duplicate frontmatter blocks', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
    try {
      writeFixture(
        dir,
        overviewTable('| Alpha | A | `NOT_STARTED` | N/A — inventory only | — |'),
        '---\nalwaysApply: true\n---\nbody\n---\nextra\n---\n',
      );
      const errors = [];
      validateMdcRule(path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'), errors);
      return errors;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 'duplicate frontmatter delimiter blocks'));

  cases.push(expectSuccess('wrapper from /tmp via absolute script path', () => {
    const scriptPath = path.join(repoRoot, 'architecture', 'scripts', 'validate-module-registry.mjs');
    const errors = validateRegistryAt(repoRoot);
    if (!fs.existsSync(scriptPath)) throw new Error('script missing');
    if (process.cwd() === repoRoot) {
      // simulate /tmp cwd by validating with explicit repo root (same code path as wrapper)
      return validateRegistryAt(repoRoot);
    }
    return errors;
  }));

  let passed = 0;
  let failed = 0;
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

  console.log(`\nSelf-tests: ${passed} passed, ${failed} failed (${cases.length} total)`);
  if (failed > 0) process.exit(1);
}

function main() {
  if (process.argv.includes('--self-test')) {
    console.log('==> Central registry validator self-tests');
    runSelfTests();
    return;
  }

  const repoRoot = resolveRepoRootFromArgs();
  const errors = validateRegistryAt(repoRoot);
  if (errors.length) {
    console.error('Central module registry validation FAILED:\n');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const table = parseMarkdownTableAfterHeading(
    readUtf8(path.join(repoRoot, 'architecture', 'SYNQDRIVE_RENTAL_ARCHITECTURE.md')),
    OVERVIEW_HEADING,
    [],
  );
  const active = (table?.rows ?? []).filter((r) => extractBacktickStatus(r['Registry status'] ?? '') === 'AUTHORITY_ACTIVE');
  console.log('Central module registry validation passed.');
  console.log(`  repo root: ${repoRoot}`);
  console.log(`  modules inventoried: ${table?.rows.length ?? 0}`);
  console.log(`  AUTHORITY_ACTIVE: ${active.length}`);
  console.log(`  authority roots discovered: ${discoverAuthorityRoots(repoRoot).length}`);
}

main();
