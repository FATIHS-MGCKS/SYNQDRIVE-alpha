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
import { spawnSync } from 'node:child_process';
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
const NOT_STARTED_NATIVE_EXACT = 'N/A — inventory only';
const NOT_STARTED_PATH_EXACT = '—';

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

function isExactNotStartedNativeStatus(s) {
  return normalizeWhitespace(s) === NOT_STARTED_NATIVE_EXACT;
}

function isExactNotStartedPathPlaceholder(cell) {
  return normalizeWhitespace(cell) === NOT_STARTED_PATH_EXACT;
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
  if (!trimmed || isExactNotStartedPathPlaceholder(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed)) return { raw: trimmed, isUrl: true };
  const link = trimmed.match(/\]\(([^)]+)\)/);
  const target = link ? link[1].split('#')[0].trim() : trimmed.replace(/^`+|`+$/g, '');
  if (!target || isExactNotStartedPathPlaceholder(target)) return null;
  return { raw: target, isUrl: /^https?:\/\//i.test(target) };
}

function normalizeAuthorityRelPath(p) {
  let s = p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (!s.startsWith('architecture/')) {
    s = `architecture/${s.replace(/^\/+/, '')}`;
  }
  return `${s}/`;
}

function getRealPaths(repoRoot) {
  const repoRootReal = fs.realpathSync(repoRoot);
  const archRootReal = fs.realpathSync(path.join(repoRoot, 'architecture'));
  return { repoRootReal, archRootReal };
}

function assertRealpathContained(realPath, repoRootReal, archRootReal, moduleName, errors, context) {
  const relRepo = path.relative(repoRootReal, realPath);
  if (relRepo.startsWith('..') || path.isAbsolute(relRepo)) {
    errors.push(`${context} "${moduleName}": resolved authority path escapes repository (realpath)`);
    return false;
  }
  const relArch = path.relative(archRootReal, realPath);
  if (relArch.startsWith('..') || path.isAbsolute(relArch)) {
    errors.push(`${context} "${moduleName}": resolved authority path must remain beneath architecture/ (realpath)`);
    return false;
  }
  return true;
}

function resolveAuthorityPath(repoRoot, registryDir, raw, moduleName, errors, context, realPaths = null) {
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

  const { repoRootReal, archRootReal } = realPaths ?? getRealPaths(repoRoot);
  let resolvedReal;
  try {
    resolvedReal = fs.realpathSync(resolved);
  } catch {
    errors.push(`${context} "${moduleName}": authority path could not be resolved -> ${raw}`);
    return null;
  }
  if (!assertRealpathContained(resolvedReal, repoRootReal, archRootReal, moduleName, errors, context)) {
    return null;
  }
  if (!fs.statSync(resolvedReal).isDirectory()) {
    errors.push(`${context} "${moduleName}": resolved authority path must be a directory -> ${raw}`);
    return null;
  }

  return {
    raw,
    resolved,
    resolvedReal,
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

function detailTitleMatchesModule(moduleName, detailTitle) {
  const mod = normalizeWhitespace(moduleName);
  const det = normalizeWhitespace(detailTitle);
  if (mod === det) return true;
  if (det.startsWith(`${mod} — `)) return true;
  if (det.startsWith(`${mod} (`)) return true;
  return false;
}

function buildDetailSectionIndex(moduleNames, sections, errors) {
  const index = new Map();
  const sectionOwners = new Map();

  for (const moduleName of moduleNames) {
    const matches = sections.filter((s) => detailTitleMatchesModule(moduleName, s.title));
    if (matches.length > 1) {
      errors.push(
        `Ambiguous detail sections for "${moduleName}": ${matches.map((m) => `"${m.title}"`).join(', ')}`,
      );
      continue;
    }
    if (matches.length === 1) {
      const section = matches[0];
      if (index.has(moduleName)) {
        errors.push(`Duplicate detail section mapping for "${moduleName}"`);
      } else {
        index.set(moduleName, section);
      }
      const owner = sectionOwners.get(section.title);
      if (owner && owner !== moduleName) {
        errors.push(
          `Detail section "${section.title}" matches multiple modules: "${owner}" and "${moduleName}"`,
        );
      } else {
        sectionOwners.set(section.title, moduleName);
      }
    }
  }

  return index;
}

function findDetailSectionForModule(moduleName, detailIndex) {
  return detailIndex.get(moduleName) ?? null;
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

function slugifyHeading(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function buildRegistryAnchorIndex(detailSections, tableRows) {
  const anchorToModule = new Map();
  for (const row of tableRows) {
    const moduleName = row.Module?.trim();
    if (!moduleName) continue;
    const section = detailSections.find((s) => detailTitleMatchesModule(moduleName, s.title));
    if (section) {
      const slug = slugifyHeading(section.title);
      anchorToModule.set(slug, moduleName);
      anchorToModule.set(slugifyHeading(moduleName), moduleName);
    }
  }
  return anchorToModule;
}

function buildModuleLookup(tableRows) {
  const byLower = new Map();
  const byName = new Map();
  for (const row of tableRows) {
    const name = row.Module?.trim();
    if (!name) continue;
    byLower.set(name.toLowerCase(), name);
    byName.set(name, row);
  }
  return { byLower, byName };
}

function resolveRegistryLinkTarget(registryDir, repoRoot, target, realPaths) {
  const resolved = path.resolve(registryDir, target);
  const rel = path.relative(repoRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, reason: 'escapes repository' };
  }
  if (!fs.existsSync(resolved)) {
    return { ok: false, reason: 'missing' };
  }
  const { repoRootReal, archRootReal } = realPaths;
  let resolvedReal;
  try {
    resolvedReal = fs.realpathSync(resolved);
  } catch {
    return { ok: false, reason: 'unresolvable' };
  }
  const relRepo = path.relative(repoRootReal, resolvedReal);
  if (relRepo.startsWith('..') || path.isAbsolute(relRepo)) {
    return { ok: false, reason: 'realpath escapes repository' };
  }
  const relPosix = rel.replace(/\\/g, '/');
  if (relPosix.startsWith('architecture/')) {
    const relArch = path.relative(archRootReal, resolvedReal);
    if (relArch.startsWith('..') || path.isAbsolute(relArch)) {
      return { ok: false, reason: 'realpath escapes architecture/' };
    }
  }
  return { ok: true, resolved, resolvedReal };
}

function resolveRegistryLinks(content, registryDir, repoRoot, errors, label, realPaths) {
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const full = m[1].trim();
    const target = full.split('#')[0].trim();
    if (!target || target.startsWith('http')) continue;
    const result = resolveRegistryLinkTarget(registryDir, repoRoot, target, realPaths);
    if (!result.ok) {
      errors.push(`${label}: broken relative link -> ${target} (${result.reason})`);
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

function getRowAuthorityPathInfo(row, repoRoot, registryDir, realPaths, errors, context) {
  const pathRaw = extractAuthorityPathRaw(row['Authority path'] ?? '');
  if (!pathRaw || pathRaw.isUrl) return null;
  return resolveAuthorityPath(
    repoRoot,
    registryDir,
    pathRaw.raw,
    row.Module?.trim() ?? '(unknown)',
    errors,
    context,
    realPaths,
  );
}

function validateSuccessorPointer(moduleName, row, detail, tableRows, registryDir, repoRoot, realPaths, errors) {
  const corpus = [
    row.Module ?? '',
    row['Mini description'] ?? '',
    row['Authority-native status'] ?? '',
    row['Authority path'] ?? '',
    detail?.body ?? '',
  ].join('\n');

  const successorText = extractSuccessorInfo(corpus);
  if (!successorText) {
    errors.push(
      `SUPERSEDED row "${moduleName}" missing explicit successor (expected "Successor: <Module Name>" notation)`,
    );
    return;
  }

  const moduleLookup = buildModuleLookup(tableRows);
  const anchorIndex = buildRegistryAnchorIndex(parseDetailSections(readUtf8(path.join(repoRoot, 'architecture', 'SYNQDRIVE_RENTAL_ARCHITECTURE.md'))), tableRows);

  const linkMatch = successorText.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (linkMatch) {
    const linkLabel = linkMatch[1].trim();
    const linkTarget = linkMatch[2].trim();
    if (/^https?:\/\//i.test(linkTarget)) {
      errors.push(
        `SUPERSEDED row "${moduleName}" successor link must be a registry anchor or authority path, not external URL`,
      );
      return;
    }

    const [pathPart, anchorPart] = linkTarget.includes('#')
      ? [linkTarget.split('#')[0].trim(), linkTarget.split('#').slice(1).join('#').trim()]
      : [linkTarget, ''];

    let successorModule = null;

    if (anchorPart) {
      const slug = anchorPart.toLowerCase();
      successorModule = anchorIndex.get(slug) ?? null;
      if (!successorModule) {
        errors.push(
          `SUPERSEDED row "${moduleName}" successor anchor "#${anchorPart}" does not match a registered module heading`,
        );
        return;
      }
    }

    if (pathPart) {
      const pathInfo = resolveAuthorityPath(
        repoRoot,
        registryDir,
        pathPart,
        moduleName,
        errors,
        'SUPERSEDED successor',
        realPaths,
      );
      if (!pathInfo) return;

      const namedFromLabel = moduleLookup.byLower.get(linkLabel.toLowerCase()) ?? moduleLookup.byLower.get(path.basename(pathPart).toLowerCase());
      const candidate = successorModule ?? namedFromLabel ?? moduleLookup.byLower.get(normalizeWhitespace(linkLabel).toLowerCase());

      if (!candidate) {
        errors.push(
          `SUPERSEDED row "${moduleName}" successor path "${pathPart}" does not correspond to a registered module authority path`,
        );
        return;
      }

      const successorRow = moduleLookup.byName.get(candidate);
      const successorPathInfo = getRowAuthorityPathInfo(successorRow, repoRoot, registryDir, realPaths, errors, 'Successor row');
      if (!successorPathInfo) {
        errors.push(`SUPERSEDED row "${moduleName}" registered successor "${candidate}" has no valid authority path`);
        return;
      }
      if (successorPathInfo.normalized !== pathInfo.normalized) {
        errors.push(
          `SUPERSEDED row "${moduleName}" successor path "${pathPart}" does not match registered successor "${candidate}" authority path ${successorPathInfo.normalized}`,
        );
        return;
      }
      successorModule = candidate;
    } else if (successorModule) {
      // anchor-only link validated above
    } else {
      successorModule = moduleLookup.byLower.get(linkLabel.toLowerCase());
      if (!successorModule) {
        errors.push(`SUPERSEDED row "${moduleName}" successor link label "${linkLabel}" is not a registered module`);
        return;
      }
    }

    if (successorModule && successorModule.toLowerCase() === moduleName.toLowerCase()) {
      errors.push(`SUPERSEDED row "${moduleName}" successor cannot point to itself`);
    }
    return;
  }

  const named = successorText.replace(/[`[\]]/g, '').split('|')[0].trim();
  const successorModule = moduleLookup.byLower.get(named.toLowerCase());
  if (!successorModule) {
    errors.push(`SUPERSEDED row "${moduleName}" successor "${named}" is not a registered module name`);
    return;
  }
  if (successorModule.toLowerCase() === moduleName.toLowerCase()) {
    errors.push(`SUPERSEDED row "${moduleName}" successor cannot point to itself`);
  }
}

function parseLeadingFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') {
    return { hasFrontmatter: false, body: '', rest: content };
  }
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) {
    return { hasFrontmatter: false, body: '', rest: content };
  }
  const body = lines.slice(1, closeIdx).join('\n');
  const rest = lines.slice(closeIdx + 1).join('\n');
  return { hasFrontmatter: true, body, rest };
}

function hasSecondYamlFrontmatter(rest) {
  const re = /^---\r?\n([\s\S]*?)\r?\n---/m;
  const m = rest.match(re);
  if (!m) return false;
  const inner = m[1];
  return /^\s*[\w.-]+\s*:/m.test(inner);
}

function validateMdcRule(rulePath, errors, label = '.cursor/rules/Architectur-Updates.mdc') {
  if (!fs.existsSync(rulePath)) {
    errors.push(`Missing ${label}`);
    return;
  }
  const rule = readUtf8(rulePath);
  const { hasFrontmatter, body, rest } = parseLeadingFrontmatter(rule);

  if (!hasFrontmatter) {
    errors.push(`${label}: file must begin with one frontmatter block`);
    return;
  }

  if (hasSecondYamlFrontmatter(rest)) {
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
  const realPaths = getRealPaths(repoRoot);

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
  }

  const detailIndex = buildDetailSectionIndex(moduleNames, detailSections, errors);

  for (const row of table.rows) {
    const moduleName = row.Module?.trim();
    const mini = row['Mini description']?.trim();
    const status = extractBacktickStatus(row['Registry status'] ?? '');
    const nativeStatus = row['Authority-native status']?.trim() ?? '';
    const pathCell = row['Authority path'] ?? '';

    const pathRaw = extractAuthorityPathRaw(pathCell);
    let pathInfo = null;
    if (pathRaw) {
      if (pathRaw.isUrl) {
        errors.push(`Overview row "${moduleName}": authority path must not be an external URL`);
      } else {
        pathInfo = resolveAuthorityPath(
          repoRoot,
          registryDir,
          pathRaw.raw,
          moduleName,
          errors,
          'Overview row',
          realPaths,
        );
        if (pathInfo) {
          const norm = pathInfo.normalized;
          if (pathsSeen.has(norm) && pathsSeen.get(norm) !== moduleName) {
            errors.push(`Duplicate authority path ${norm} for modules ${pathsSeen.get(norm)} and ${moduleName}`);
          }
          pathsSeen.set(norm, moduleName);
        }
      }
    }

    const detail = moduleName ? findDetailSectionForModule(moduleName, detailIndex) : null;

    if (status === 'NOT_STARTED') {
      if (!isExactNotStartedNativeStatus(nativeStatus)) {
        errors.push(
          `NOT_STARTED row "${moduleName}": authority-native status must be exactly "N/A — inventory only", got "${nativeStatus}"`,
        );
      }
      if (!isExactNotStartedPathPlaceholder(pathCell)) {
        errors.push(`NOT_STARTED row "${moduleName}": authority path must be exactly "—"`);
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
      if (!nativeStatus || isExactNotStartedNativeStatus(nativeStatus)) {
        errors.push(
          `AUDIT_IN_PROGRESS row "${moduleName}": authority-native status must be non-empty and not "N/A — inventory only"`,
        );
      }
    }

    if (status === 'AUTHORITY_ACTIVE') {
      if (!pathInfo) errors.push(`AUTHORITY_ACTIVE row "${moduleName}" missing valid authority path`);
      if (!nativeStatus || isExactNotStartedPathPlaceholder(nativeStatus)) {
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
          const result = resolveRegistryLinkTarget(registryDir, repoRoot, link, realPaths);
          if (!result.ok) {
            errors.push(`AUTHORITY_ACTIVE row "${moduleName}": mandatory entry link missing -> ${link}`);
          }
        }
      }
    }

    if (status === 'SUPERSEDED') {
      validateSuccessorPointer(moduleName, row, detail, table.rows, registryDir, repoRoot, realPaths, errors);
    }
  }

  const sorted = [...moduleNames].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  if (JSON.stringify(moduleNames) !== JSON.stringify(sorted)) {
    errors.push(`Overview modules not alphabetically sorted. Expected: ${sorted.join(', ')}; got: ${moduleNames.join(', ')}`);
  }

  resolveRegistryLinks(content, registryDir, repoRoot, errors, 'SYNQDRIVE_RENTAL_ARCHITECTURE.md', realPaths);

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
  fs.writeFileSync(
    path.join(dir, 'AGENTS.md'),
    '# AGENTS\narchitecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md\narchitecture/MODULE_AUTHORITY_STANDARD.md\n',
  );
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

function expectError(name, fn, snippet, { forbid = [], maxErrors = null } = {}) {
  return {
    name,
    fn: () => {
      const errors = fn();
      const matching = errors.filter((e) => e.includes(snippet));
      if (matching.length === 0) {
        throw new Error(`Expected error containing "${snippet}", got: ${errors.join('; ') || '(none)'}`);
      }
      for (const bad of forbid) {
        if (errors.some((e) => e.includes(bad))) {
          throw new Error(`Unexpected error containing "${bad}" while testing "${snippet}"`);
        }
      }
      if (maxErrors !== null && errors.length > maxErrors) {
        throw new Error(
          `Expected at most ${maxErrors} error(s) for isolated test "${snippet}", got ${errors.length}: ${errors.join('; ')}`,
        );
      }
    },
  };
}

function expectSuccess(name, fn) {
  return {
    name,
    fn: () => {
      const errors = fn();
      if (errors.length) throw new Error(errors.join('\n'));
    },
  };
}

function mkAuthorityDir(dir, relPath) {
  const full = path.join(dir, 'architecture', relPath);
  fs.mkdirSync(full, { recursive: true });
  fs.writeFileSync(path.join(full, 'README.md'), '# Living Architecture Authority\n');
  return full;
}

function runSelfTests() {
  const cases = [];
  const repoRoot = findRepoRoot(__dirname);

  cases.push(expectSuccess('valid registry (repository)', () => validateRegistryAt(repoRoot)));

  cases.push(
    expectError(
      'missing mini description',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          writeFixture(dir, overviewTable('| Alpha |  | `NOT_STARTED` | N/A — inventory only | — |'));
          return validateRegistryAt(dir, { skipMdc: true });
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'missing mini description',
      { maxErrors: 1 },
    ),
  );

  cases.push(
    expectError(
      'NOT_STARTED incorrect native status',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          writeFixture(dir, overviewTable('| Alpha | Desc | `NOT_STARTED` | CANONICAL | — |'));
          return validateRegistryAt(dir, { skipMdc: true });
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'authority-native status must be exactly "N/A — inventory only"',
    ),
  );

  for (const [label, native] of [
    ['NOT_STARTED native ASCII hyphen', 'N/A - inventory only'],
    ['NOT_STARTED native en dash variant', 'N/A – inventory only'],
  ]) {
    cases.push(
      expectError(
        label,
        () => {
          const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
          try {
            writeFixture(dir, overviewTable(`| Alpha | Desc | \`NOT_STARTED\` | ${native} | — |`));
            return validateRegistryAt(dir, { skipMdc: true });
          } finally {
            fs.rmSync(dir, { recursive: true, force: true });
          }
        },
        'authority-native status must be exactly "N/A — inventory only"',
      ),
    );
  }

  for (const [label, pathCell] of [
    ['NOT_STARTED path ASCII hyphen', '-'],
    ['NOT_STARTED path en dash variant', '–'],
    ['NOT_STARTED path N/A placeholder', 'N/A'],
  ]) {
    cases.push(
      expectError(
        label,
        () => {
          const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
          try {
            writeFixture(dir, overviewTable(`| Alpha | Desc | \`NOT_STARTED\` | N/A — inventory only | ${pathCell} |`));
            return validateRegistryAt(dir, { skipMdc: true });
          } finally {
            fs.rmSync(dir, { recursive: true, force: true });
          }
        },
        'authority path must be exactly "—"',
      ),
    );
  }

  cases.push(
    expectError(
      'NOT_STARTED incorrect authority path placeholder',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          writeFixture(dir, overviewTable('| Alpha | Desc | `NOT_STARTED` | N/A — inventory only | N/A |'));
          return validateRegistryAt(dir, { skipMdc: true });
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'authority path must be exactly "—"',
    ),
  );

  cases.push(
    expectError(
      'NOT_STARTED existing authority path',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          mkAuthorityDir(dir, 'alpha');
          writeFixture(dir, overviewTable('| Alpha | Desc | `NOT_STARTED` | N/A — inventory only | [alpha/](alpha/) |'));
          return validateRegistryAt(dir, { skipMdc: true });
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'must not declare a usable authority path',
    ),
  );

  cases.push(
    expectError(
      'invalid status',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          writeFixture(dir, overviewTable('| Alpha | Desc | `BOGUS` | N/A — inventory only | — |'));
          return validateRegistryAt(dir, { skipMdc: true });
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'invalid registry status',
    ),
  );

  cases.push(
    expectError(
      'duplicate module',
      () => {
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
      },
      'Duplicate module name',
    ),
  );

  cases.push(
    expectError(
      'case-insensitive duplicate module',
      () => {
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
      },
      'case-insensitive',
    ),
  );

  cases.push(
    expectError(
      'unsorted modules',
      () => {
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
      },
      'not alphabetically sorted',
    ),
  );

  cases.push(
    expectSuccess('escaped pipe in mini description', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
      try {
        writeFixture(dir, overviewTable('| Alpha | Pipe \\| test | `NOT_STARTED` | N/A — inventory only | — |'));
        return validateRegistryAt(dir, { skipMdc: true });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }),
  );

  cases.push(
    expectError(
      'malformed cell count',
      () => {
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
      },
      'has 3 cells, expected 5',
    ),
  );

  cases.push(
    expectSuccess('detail matching Trip vs Trip Detection vs Trip Enrichment', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
      try {
        mkAuthorityDir(dir, 'trip');
        mkAuthorityDir(dir, 'trip-detection');
        mkAuthorityDir(dir, 'trip-enrichment');
        writeFixture(
          dir,
          `${overviewTable('| Trip | T | `AUTHORITY_ACTIVE` | Native | [trip/](trip/) |\n| Trip Detection | TD | `AUTHORITY_ACTIVE` | Native | [trip-detection/](trip-detection/) |\n| Trip Enrichment | TE | `AUTHORITY_ACTIVE` | Native | [trip-enrichment/](trip-enrichment/) |')}\n### Trip Detection\n\n| Field | Value |\n| **Registry coverage status** | \`AUTHORITY_ACTIVE\` |\n| **Authority directory** | [trip-detection/](trip-detection/) |\n| **Mandatory entry documents** | [README.md](trip-detection/README.md) |\n\n### Trip Enrichment\n\n| Field | Value |\n| **Registry coverage status** | \`AUTHORITY_ACTIVE\` |\n| **Authority directory** | [trip-enrichment/](trip-enrichment/) |\n| **Mandatory entry documents** | [README.md](trip-enrichment/README.md) |\n\n### Trip\n\n| Field | Value |\n| **Registry coverage status** | \`AUTHORITY_ACTIVE\` |\n| **Authority directory** | [trip/](trip/) |\n| **Mandatory entry documents** | [README.md](trip/README.md) |\n`,
        );
        const errors = validateRegistryAt(dir, { skipMdc: true });
        if (errors.some((e) => e.includes('Ambiguous detail sections'))) {
          throw new Error(`Prefix modules must not be ambiguous: ${errors.join('; ')}`);
        }
        return errors;
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }),
  );

  cases.push(
    expectError(
      'duplicate detail section for same module',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          mkAuthorityDir(dir, 'alpha');
          writeFixture(
            dir,
            `${overviewTable('| Alpha | A | `AUTHORITY_ACTIVE` | Native | [alpha/](alpha/) |')}\n### Alpha\n\n| Field | Value |\n| **Registry coverage status** | \`AUTHORITY_ACTIVE\` |\n| **Authority directory** | [alpha/](alpha/) |\n| **Mandatory entry documents** | [README.md](alpha/README.md) |\n\n### Alpha — duplicate\n\n| Field | Value |\n| **Registry coverage status** | \`AUTHORITY_ACTIVE\` |\n`,
          );
          return validateRegistryAt(dir, { skipMdc: true });
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'Ambiguous detail sections for "Alpha"',
    ),
  );

  cases.push(
    expectError(
      'missing active authority path',
      () => {
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
      },
      'missing valid authority path',
    ),
  );

  cases.push(
    expectError(
      'active row/detail status mismatch',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          mkAuthorityDir(dir, 'alpha');
          writeFixture(
            dir,
            `${overviewTable('| Alpha | A | `AUTHORITY_ACTIVE` | Native | [alpha/](alpha/) |')}\n### Alpha\n\n| Field | Value |\n| **Registry coverage status** | \`AUDIT_IN_PROGRESS\` |\n| **Authority directory** | [alpha/](alpha/) |\n| **Mandatory entry documents** | [README.md](alpha/README.md) |\n`,
          );
          return validateRegistryAt(dir, { skipMdc: true });
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'Status mismatch',
    ),
  );

  cases.push(
    expectError(
      'AUDIT_IN_PROGRESS missing path',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          writeFixture(dir, overviewTable('| Alpha | A | `AUDIT_IN_PROGRESS` | Reconstruction started | — |'));
          return validateRegistryAt(dir, { skipMdc: true });
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'missing declared authority path',
    ),
  );

  cases.push(
    expectError(
      'AUDIT_IN_PROGRESS nonexistent path',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          writeFixture(dir, overviewTable('| Alpha | A | `AUDIT_IN_PROGRESS` | Reconstruction started | [missing/](missing/) |'));
          return validateRegistryAt(dir, { skipMdc: true });
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'authority path does not exist',
    ),
  );

  cases.push(
    expectError(
      'AUDIT_IN_PROGRESS path is file',
      () => {
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
      },
      'authority path must be a directory',
    ),
  );

  cases.push(
    expectError(
      'AUDIT_IN_PROGRESS path outside architecture',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          fs.mkdirSync(path.join(dir, 'outside'), { recursive: true });
          writeFixture(dir, overviewTable('| Alpha | A | `AUDIT_IN_PROGRESS` | Reconstruction started | [../outside/](../outside/) |'));
          return validateRegistryAt(dir, { skipMdc: true });
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'must be beneath architecture/',
    ),
  );

  cases.push(
    expectError(
      'authority symlink escapes repository',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-out-'));
        try {
          const arch = path.join(dir, 'architecture');
          fs.mkdirSync(arch, { recursive: true });
          fs.mkdirSync(outside, { recursive: true });
          fs.writeFileSync(path.join(outside, 'README.md'), '# Living Architecture Authority\n');
          try {
            fs.symlinkSync(outside, path.join(arch, 'escape-link'), 'dir');
          } catch (err) {
            return [`SYMLINK_TEST_SKIPPED: ${err.message}`];
          }
          writeFixture(
            dir,
            overviewTable('| Alpha | A | `AUDIT_IN_PROGRESS` | Started | [escape-link/](escape-link/) |'),
          );
          const errors = validateRegistryAt(dir, { skipMdc: true });
          if (errors.some((e) => e.includes('SYMLINK_TEST_SKIPPED'))) {
            console.log('  NOTE authority symlink escapes repository: skipped (symlink creation unavailable)');
            return [];
          }
          return errors;
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
          fs.rmSync(outside, { recursive: true, force: true });
        }
      },
      'escapes repository (realpath)',
    ),
  );

  cases.push(
    expectError(
      'missing successor for SUPERSEDED',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          writeFixture(dir, overviewTable('| Alpha | A | `SUPERSEDED` | Old | — |'));
          return validateRegistryAt(dir, { skipMdc: true });
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'missing explicit successor',
    ),
  );

  cases.push(
    expectSuccess('SUPERSEDED valid named successor', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
      try {
        mkAuthorityDir(dir, 'beta');
        writeFixture(
          dir,
          overviewTable(
            '| Alpha | A | `SUPERSEDED` | Successor: Beta | — |\n| Beta | B | `AUTHORITY_ACTIVE` | Native | [beta/](beta/) |',
          ) +
            '\n### Beta\n\n| Field | Value |\n| **Registry coverage status** | `AUTHORITY_ACTIVE` |\n| **Authority directory** | [beta/](beta/) |\n| **Mandatory entry documents** | [README.md](beta/README.md) |\n',
        );
        return validateRegistryAt(dir, { skipMdc: true });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }),
  );

  cases.push(
    expectSuccess('SUPERSEDED valid registered-module anchor', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
      try {
        mkAuthorityDir(dir, 'beta');
        writeFixture(
          dir,
          overviewTable(
            '| Alpha | A | `SUPERSEDED` | Successor: [Beta](#beta) | — |\n| Beta | B | `AUTHORITY_ACTIVE` | Native | [beta/](beta/) |',
          ) +
            '\n### Beta\n\n| Field | Value |\n| **Registry coverage status** | `AUTHORITY_ACTIVE` |\n| **Authority directory** | [beta/](beta/) |\n| **Mandatory entry documents** | [README.md](beta/README.md) |\n',
        );
        return validateRegistryAt(dir, { skipMdc: true });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }),
  );

  cases.push(
    expectSuccess('SUPERSEDED successor in detail section', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
      try {
        mkAuthorityDir(dir, 'beta');
        writeFixture(
          dir,
          overviewTable('| Alpha | A | `SUPERSEDED` | Historical | — |\n| Beta | B | `AUTHORITY_ACTIVE` | Native | [beta/](beta/) |') +
            '\n### Alpha\n\n| Field | Value |\n| **Successor** | Successor: Beta |\n\n### Beta\n\n| Field | Value |\n| **Registry coverage status** | `AUTHORITY_ACTIVE` |\n| **Authority directory** | [beta/](beta/) |\n| **Mandatory entry documents** | [README.md](beta/README.md) |\n',
        );
        return validateRegistryAt(dir, { skipMdc: true });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }),
  );

  cases.push(
    expectError(
      'SUPERSEDED nonexistent anchor',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          writeFixture(dir, overviewTable('| Alpha | A | `SUPERSEDED` | Successor: [Beta](#missing-anchor) | — |'));
          return validateRegistryAt(dir, { skipMdc: true });
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'successor anchor "#missing-anchor" does not match a registered module heading',
    ),
  );

  cases.push(
    expectError(
      'SUPERSEDED self-successor',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          writeFixture(dir, overviewTable('| Alpha | A | `SUPERSEDED` | Successor: Alpha | — |'));
          return validateRegistryAt(dir, { skipMdc: true });
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'successor cannot point to itself',
    ),
  );

  cases.push(
    expectError(
      'SUPERSEDED arbitrary existing path',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          mkAuthorityDir(dir, 'beta');
          mkAuthorityDir(dir, 'gamma');
          writeFixture(
            dir,
            overviewTable(
              '| Alpha | A | `SUPERSEDED` | Successor: [gamma/](gamma/) | — |\n| Beta | B | `AUTHORITY_ACTIVE` | Native | [beta/](beta/) |',
            ) +
              '\n### Beta\n\n| Field | Value |\n| **Registry coverage status** | `AUTHORITY_ACTIVE` |\n| **Authority directory** | [beta/](beta/) |\n| **Mandatory entry documents** | [README.md](beta/README.md) |\n',
          );
          return validateRegistryAt(dir, { skipMdc: true });
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'does not correspond to a registered module authority path',
    ),
  );

  cases.push(
    expectSuccess('SUPERSEDED valid registered successor authority path', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
      try {
        mkAuthorityDir(dir, 'beta');
        writeFixture(
          dir,
          overviewTable(
            '| Alpha | A | `SUPERSEDED` | Successor: [Beta](beta/) | — |\n| Beta | B | `AUTHORITY_ACTIVE` | Native | [beta/](beta/) |',
          ) +
            '\n### Beta\n\n| Field | Value |\n| **Registry coverage status** | `AUTHORITY_ACTIVE` |\n| **Authority directory** | [beta/](beta/) |\n| **Mandatory entry documents** | [README.md](beta/README.md) |\n',
        );
        return validateRegistryAt(dir, { skipMdc: true });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }),
  );

  cases.push(
    expectError(
      'SUPERSEDED successor link escaping repository',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          fs.mkdirSync(path.join(dir, 'outside'), { recursive: true });
          writeFixture(dir, overviewTable('| Alpha | A | `SUPERSEDED` | Successor: [Outside](../outside/) | — |'));
          return validateRegistryAt(dir, { skipMdc: true });
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'must be beneath architecture/',
    ),
  );

  cases.push(
    expectError(
      'SUPERSEDED broken successor link',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          writeFixture(dir, overviewTable('| Alpha | A | `SUPERSEDED` | Successor: [Beta](missing/) | — |'));
          return validateRegistryAt(dir, { skipMdc: true });
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'authority path does not exist',
    ),
  );

  cases.push(
    expectSuccess('MDC valid single frontmatter', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
      try {
        writeFixture(dir, overviewTable('| Alpha | A | `NOT_STARTED` | N/A — inventory only | — |'));
        const errors = [];
        validateMdcRule(path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'), errors);
        return errors;
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }),
  );

  cases.push(
    expectSuccess('MDC horizontal rule allowed in body', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
      try {
        writeFixture(
          dir,
          overviewTable('| Alpha | A | `NOT_STARTED` | N/A — inventory only | — |'),
          '---\nalwaysApply: true\n---\n\n## Section\n\n---\n\nSYNQDRIVE_RENTAL_ARCHITECTURE.md UPDATED UNCHANGED validate-module-registry\n',
        );
        const errors = [];
        validateMdcRule(path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'), errors);
        return errors;
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }),
  );

  cases.push(
    expectError(
      'MDC missing frontmatter',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          writeFixture(dir, overviewTable('| Alpha | A | `NOT_STARTED` | N/A — inventory only | — |'), 'no frontmatter\n');
          const errors = [];
          validateMdcRule(path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'), errors);
          return errors;
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'must begin with one frontmatter block',
    ),
  );

  cases.push(
    expectError(
      'MDC alwaysApply false',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          writeFixture(dir, overviewTable('| Alpha | A | `NOT_STARTED` | N/A — inventory only | — |'), '---\nalwaysApply: false\n---\n');
          const errors = [];
          validateMdcRule(path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'), errors);
          return errors;
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'alwaysApply must not be false',
    ),
  );

  cases.push(
    expectError(
      'MDC commented alwaysApply',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          writeFixture(
            dir,
            overviewTable('| Alpha | A | `NOT_STARTED` | N/A — inventory only | — |'),
            '---\n# alwaysApply: true\n---\nSYNQDRIVE_RENTAL_ARCHITECTURE.md\n',
          );
          const errors = [];
          validateMdcRule(path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'), errors);
          return errors;
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'frontmatter must contain exact active property alwaysApply: true',
    ),
  );

  cases.push(
    expectError(
      'MDC duplicate frontmatter blocks',
      () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regval-'));
        try {
          writeFixture(
            dir,
            overviewTable('| Alpha | A | `NOT_STARTED` | N/A — inventory only | — |'),
            '---\nalwaysApply: true\n---\nbody\n---\nalwaysApply: false\n---\n',
          );
          const errors = [];
          validateMdcRule(path.join(dir, '.cursor', 'rules', 'Architectur-Updates.mdc'), errors);
          return errors;
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
      'duplicate frontmatter delimiter blocks',
    ),
  );

  cases.push({
    name: 'wrapper subprocess from external cwd',
    fn: () => {
      const scriptPath = path.join(repoRoot, 'architecture', 'scripts', 'validate-module-registry.sh');
      const result = spawnSync('bash', [scriptPath], {
        cwd: os.tmpdir(),
        encoding: 'utf8',
        env: process.env,
      });
      if (result.error) throw result.error;
      if (result.status !== 0) {
        throw new Error(`wrapper exited ${result.status}: ${result.stderr || result.stdout}`);
      }
      const out = `${result.stdout}${result.stderr}`;
      if (!out.includes('Central module registry validation passed.')) {
        throw new Error(`missing success marker in wrapper output: ${out}`);
      }
      if (!out.includes('AUTHORITY_ACTIVE: 7')) {
        throw new Error(`missing expected module counts in wrapper output: ${out}`);
      }
      if (!out.includes('modules inventoried: 64')) {
        throw new Error(`missing inventoried count in wrapper output: ${out}`);
      }
    },
  });

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
