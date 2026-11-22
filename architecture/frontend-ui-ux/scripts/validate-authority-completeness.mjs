/**
 * Mandatory authority artifact completeness (content gates) — docs only.
 * Imported by FEUX/MAUX/RENTUX/OPUX validate-graph.mjs
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
  'PRODUCTION_ACCESS',
  'Audit coverage',
];

const CONTRACT_REQUIRED = [
  'validate-module-registry',
  'REGISTRY_REVIEWED',
  'Production',
  'substantive',
];

const CURRENT_STATE_MIN_CHARS = 2500;

export function validateAuthorityCompleteness(authorityDir, fail, { moduleLabel = 'authority' } = {}) {
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
    if (!manifest.includes(key)) fail(`[${moduleLabel}] AUDIT_MANIFEST.md missing: ${key}`);
  }

  const contract = fs.readFileSync(path.join(authorityDir, 'AGENT_CONTRACT.md'), 'utf8');
  const contractLower = contract.toLowerCase();
  for (const key of CONTRACT_REQUIRED) {
    if (!contractLower.includes(key.toLowerCase())) fail(`[${moduleLabel}] AGENT_CONTRACT.md missing: ${key}`);
  }

  const current = fs.readFileSync(path.join(authorityDir, 'CURRENT_STATE.md'), 'utf8');
  if (current.length < CURRENT_STATE_MIN_CHARS) {
    fail(`[${moduleLabel}] CURRENT_STATE.md too short (${current.length} < ${CURRENT_STATE_MIN_CHARS} chars)`);
  }
  for (const axis of ['CONFIRMED', 'INFERRED', 'UNKNOWN']) {
    if (!current.includes(axis)) fail(`[${moduleLabel}] CURRENT_STATE.md must label epistemic states (missing ${axis})`);
  }

  const inv = fs.readFileSync(path.join(authorityDir, 'graph/invariants.yaml'), 'utf8');
  if (!inv.includes('owning_authority') && !inv.includes('owning_authority:')) {
    fail(`[${moduleLabel}] graph/invariants.yaml must declare owning_authority per invariant`);
  }
  if (!inv.includes('risk_if_violated')) {
    fail(`[${moduleLabel}] graph/invariants.yaml must declare risk_if_violated`);
  }
}