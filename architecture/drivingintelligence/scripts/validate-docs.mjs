#!/usr/bin/env node
/**
 * Lightweight architecture-doc consistency validation for Driving Intelligence authority.
 * Usage: node architecture/drivingintelligence/scripts/validate-docs.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authorityDir = path.join(__dirname, '..');

const requiredFiles = [
  'README.md',
  'CURRENT_STATE.md',
  'KNOWLEDGE_GRAPH.md',
  'WORKSTREAM_HISTORY.md',
  'COVERAGE_MATRIX.md',
  'AGENT_CONTRACT.md',
  'decisions/DECISION_REGISTER.md',
  'contradictions/CONTRADICTION_REGISTER.md',
  'research/CHANGE_LEDGER.md',
  'research/DI_EV_CHRONOLOGY.md',
  'research/PR_TIMELINE.md',
  'research/HYPOTHESIS_REGISTER.md',
  'research/EXPERIMENT_REGISTER.md',
  'research/DEFECT_LEDGER.md',
  'research/LESSONS_LEARNED.md',
  'research/OPEN_QUESTIONS.md',
  'evidence/EVIDENCE_INDEX.md',
  'evidence/reference-capture/RD003_RETROSPECTIVE.md',
  'evidence/reference-capture/RD004_RETROSPECTIVE.md',
  'evidence/signal-inventory/CADENCE_DENSITY.md',
  'graph/nodes.yaml',
  'graph/edges.yaml',
  'graph/invariants.yaml',
  'graph/schema.yaml',
];

const errors = [];
function fail(msg) {
  errors.push(msg);
}

function read(rel) {
  return fs.readFileSync(path.join(authorityDir, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(authorityDir, rel));
}

console.log('==> Required files');
for (const f of requiredFiles) {
  if (!exists(f)) fail(`Missing required file: ${f}`);
  else console.log('  OK', f);
}

console.log('==> README cross-links');
const readme = read('README.md');
const linkRe = /\]\(\.\/([^)]+)\)/g;
for (const m of readme.matchAll(linkRe)) {
  const target = m[1].split('#')[0];
  if (target && !exists(target)) fail(`README link target missing: ${target}`);
}

console.log('==> Decision evidence references');
const decisionText = read('decisions/DECISION_REGISTER.md');
const evidenceIds = new Set();
for (const m of decisionText.matchAll(/\| \*\*EVIDENCE\*\* \| ([^|]+) \|/g)) {
  for (const id of m[1].matchAll(/DI-EVID-[A-Z0-9-]+/g)) evidenceIds.add(id[0]);
}
const nodesText = read('graph/nodes.yaml');
for (const id of evidenceIds) {
  if (!nodesText.includes(`id: ${id}`)) fail(`Decision EVIDENCE ${id} not found in graph nodes.yaml`);
}

console.log('==> Hypothesis register rows');
const hypText = read('research/HYPOTHESIS_REGISTER.md');
const hypIds = [...hypText.matchAll(/\| (DI-HYP-\d+) \|/g)].map((m) => m[1]);
for (const id of hypIds) {
  if (!nodesText.includes(`id: ${id}`)) fail(`Hypothesis ${id} missing from graph nodes.yaml`);
}

console.log('==> Experiment register sample links');
const expText = read('research/EXPERIMENT_REGISTER.md');
for (const m of expText.matchAll(/`(architecture\/drivingintelligence\/[^`]+)`/g)) {
  const rel = m[1].replace('architecture/drivingintelligence/', '');
  if (!exists(rel)) fail(`Experiment link missing: ${rel}`);
}

if (errors.length) {
  console.error('\n==> DOC VALIDATION FAILED');
  for (const e of errors) console.error('  -', e);
  process.exit(1);
}

console.log('==> All doc validations passed');
console.log(`  decisions evidence refs: ${evidenceIds.size}`);
console.log(`  hypotheses checked: ${hypIds.length}`);
