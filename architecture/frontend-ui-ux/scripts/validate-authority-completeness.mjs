/**
 * Mandatory authority artifact completeness (content gates) — docs only.
 */
import fs from 'fs';
import path from 'path';

const MANDATORY_FILES = [
  'README.md',
  'AUDIT_MANIFEST.md',
  'CURRENT_STATE.md',
  'AGENT_CONTRACT.md',
  'KNOWLEDGE_GRAPH.md',
  'decisions/DECISION_REGISTER.md',
  'evidence/EVIDENCE_INDEX.md',
  'evidence/PRODUCTION_BASELINE.md',
  'contradictions/KNOWLEDGE_GAPS.md',
  'contradictions/OPEN_CONTRADICTIONS.md',
  'research/CHANGE_LEDGER.md',
  'research/FAILED_APPROACHES.md',
  'research/OPEN_HYPOTHESES.md',
  'research/OPEN_QUESTIONS.md',
  'graph/schema.yaml',
  'graph/nodes.yaml',
  'graph/edges.yaml',
  'graph/invariants.yaml',
  'scripts/validate-graph.mjs',
  'scripts/validate-graph.sh',
];

const README_REQUIRED = [
  'Registry coverage status',
  'scope',
  'non-scope',
  'validation',
  'Mandatory entry',
];

const MANIFEST_REQUIRED = [
  'ORIGIN_MAIN_SHA',
  'AUDIT_BRANCH_SHA',
  'VALIDATION_RUN_SHA',
  'REPO_AUDIT_BASELINE_SHA',
  'PRODUCTION_ACCESS',
  'PRODUCTION_RELEASE_SHA',
  'REPO_PRODUCTION_DRIFT',
  'Audit coverage',
];

const CONTRACT_REQUIRED = [
  'validate-module-registry',
  'REGISTRY_REVIEWED',
  'Production',
  'substantive',
];

const DECISION_SECTION_REQUIRED = [
  'BEFORE',
  'WHY',
  'Considered alternatives',
  'CHANGE',
  'EXPECTED_EFFECT',
  'VALIDATION',
  'OBSERVED_EFFECT',
  'NON_EFFECTS',
  'TRADEOFFS',
  'REMAINING_GAPS',
  'EVIDENCE',
];

const SHA40 = /[0-9a-f]{40}/;

export function validateAuthorityCompleteness(authorityDir, fail, { moduleLabel = 'authority', decisionIdPrefix = 'FEUX-DEC-' } = {}) {
  for (const rel of MANDATORY_FILES) {
    const fp = path.join(authorityDir, rel);
    if (!fs.existsSync(fp)) fail(`[${moduleLabel}] missing mandatory file: ${rel}`);
  }

  const readme = fs.readFileSync(path.join(authorityDir, 'README.md'), 'utf8');
  for (const key of README_REQUIRED) {
    if (!readme.toLowerCase().includes(key.toLowerCase())) {
      fail(`[${moduleLabel}] README.md missing required topic: ${key}`);
    }
  }

  const manifest = fs.readFileSync(path.join(authorityDir, 'AUDIT_MANIFEST.md'), 'utf8');
  for (const key of MANIFEST_REQUIRED) {
    if (!manifest.includes(key)) fail(`[${moduleLabel}] AUDIT_MANIFEST.md missing field label: ${key}`);
  }
  if (!/AUDIT_BRANCH_SHA.*`[0-9a-f]{40}`/.test(manifest)) {
    fail(`[${moduleLabel}] AUDIT_MANIFEST.md must set AUDIT_BRANCH_SHA to 40-char git SHA in backticks`);
  }
  if (!/VALIDATION_RUN_SHA.*`[0-9a-f]{40}`/.test(manifest)) {
    fail(`[${moduleLabel}] AUDIT_MANIFEST.md must set VALIDATION_RUN_SHA to 40-char git SHA in backticks`);
  }

  const contract = fs.readFileSync(path.join(authorityDir, 'AGENT_CONTRACT.md'), 'utf8');
  const contractLower = contract.toLowerCase();
  for (const key of CONTRACT_REQUIRED) {
    if (!contractLower.includes(key.toLowerCase())) fail(`[${moduleLabel}] AGENT_CONTRACT.md missing: ${key}`);
  }

  const current = fs.readFileSync(path.join(authorityDir, 'CURRENT_STATE.md'), 'utf8');
  for (const axis of ['CONFIRMED', 'INFERRED', 'UNKNOWN']) {
    if (!current.includes(axis)) fail(`[${moduleLabel}] CURRENT_STATE.md must label epistemic states (missing ${axis})`);
  }

  const inv = fs.readFileSync(path.join(authorityDir, 'graph/invariants.yaml'), 'utf8');
  if (!inv.includes('owning_authority')) {
    fail(`[${moduleLabel}] graph/invariants.yaml must declare owning_authority per invariant`);
  }
  if (!inv.includes('risk_if_violated')) {
    fail(`[${moduleLabel}] graph/invariants.yaml must declare risk_if_violated`);
  }

  const decisionsPath = path.join(authorityDir, 'decisions/DECISION_REGISTER.md');
  const decisions = fs.readFileSync(decisionsPath, 'utf8');
  const sectionRe = new RegExp(`## (${decisionIdPrefix}[A-Z0-9-]+)`, 'g');
  const ids = [...decisions.matchAll(sectionRe)].map((m) => m[1]);
  if (ids.length === 0) {
    fail(`[${moduleLabel}] DECISION_REGISTER.md has no ## ${decisionIdPrefix}* sections`);
  }
  for (const id of ids) {
    const blockRe = new RegExp(`## ${id}[\\s\\S]*?(?=\\n## ${decisionIdPrefix}|$)`);
    const block = decisions.match(blockRe)?.[0] ?? '';
    for (const field of DECISION_SECTION_REQUIRED) {
      if (!block.includes(`**${field}**`)) {
        fail(`[${moduleLabel}] ${id} missing decision field: ${field}`);
      }
    }
    const evid = block.match(/\*\*EVIDENCE\*\* \| ([^|]+) \|/);
    if (!evid || !/[A-Z]+-EVID-/.test(evid[1])) {
      fail(`[${moduleLabel}] ${id} EVIDENCE must reference stable evidence id`);
    }
  }

  const tableRe = new RegExp(`\\| (${decisionIdPrefix}[A-Z0-9-]+) \\|`, 'g');
  const tableIds = [...decisions.matchAll(tableRe)].map((m) => m[1]);
  for (const id of tableIds) {
    if (!ids.includes(id)) fail(`[${moduleLabel}] ${id} in table missing ## section body`);
  }
}

/** Resolve documented screen-matrix paths under frontend/src. */
export function validateScreenMatrixSourcePaths(repoRoot, matrixRelPath, pathPrefix, fail, moduleLabel) {
  const matrixPath = path.join(repoRoot, matrixRelPath);
  if (!fs.existsSync(matrixPath)) return;
  const content = fs.readFileSync(matrixPath, 'utf8');
  const refs = [...content.matchAll(/`((?:frontend\/src\/)?[\w./-]+\.(?:tsx|ts))`/g)].map((m) => m[1]);
  for (const ref of refs) {
    let full;
    if (ref.startsWith('frontend/')) {
      full = path.join(repoRoot, ref);
    } else if (ref.startsWith('operator/') || ref.startsWith('master/') || ref.startsWith('rental/')) {
      full = path.join(repoRoot, 'frontend/src', ref);
    } else {
      full = path.join(repoRoot, 'frontend/src', pathPrefix, ref);
    }
    if (!fs.existsSync(full)) {
      fail(`[${moduleLabel}] screen matrix references missing file: ${ref} (resolved ${full})`);
    }
  }
}

export function validateEvidenceIndex(authorityDir, fail, { moduleLabel = 'authority', evidPrefix = 'FEUX-EVID-' } = {}) {
  const idx = fs.readFileSync(path.join(authorityDir, 'evidence/EVIDENCE_INDEX.md'), 'utf8');
  const ids = [...idx.matchAll(new RegExp(`\\| (${evidPrefix}[A-Z0-9-]+) \\|`, 'g'))].map((m) => m[1]);
  if (ids.length < 2) fail(`[${moduleLabel}] EVIDENCE_INDEX.md needs at least 2 indexed ${evidPrefix}* rows`);
  for (const id of ids) {
    const row = idx.split('\n').find((l) => l.includes(id) && l.startsWith('|'));
    if (!row) fail(`[${moduleLabel}] EVIDENCE_INDEX missing row for ${id}`);
    const skipSha =
      /GAP-|DOMAIN_REASONING|N\/A|ARCHITECTURE_DOCUMENT|docs\//i.test(row) ||
      /\d{4}-\d{2}-\d{2}/.test(row);
    if (!skipSha && !/(413175e8|[0-9a-f]{7,40}|SHA)/i.test(row)) {
      fail(`[${moduleLabel}] ${id} row missing audited SHA in index`);
    }
  }
}