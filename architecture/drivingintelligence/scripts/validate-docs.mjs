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

console.log('==> Defect ledger counts');
const defectText = read('research/DEFECT_LEDGER.md');
const defectRows = [...defectText.matchAll(/\| (DI-DEF-\d+) \|/g)].map((m) => m[1]);
const fixedCount = [...defectText.matchAll(/\| FIXED \|/g)].length;
const openCount = [...defectText.matchAll(/\| OPEN \|/g)].length;
if (defectRows.length !== 18) fail(`Defect ledger row count ${defectRows.length} != 18`);
if (fixedCount !== 15) fail(`Defect FIXED count ${fixedCount} != 15`);
if (openCount !== 3) fail(`Defect OPEN count ${openCount} != 3`);
if (!defectText.includes('TOTAL=**18**') || !defectText.includes('FIXED=**15**')) {
  fail('Defect ledger summary header missing or incorrect');
}

console.log('==> Experiment register counts');
const expText = read('research/EXPERIMENT_REGISTER.md');
const expRows = [...expText.matchAll(/\| (EXP-\d+) \|/g)].map((m) => m[1]);
if (expRows.length !== 16) fail(`Experiment row count ${expRows.length} != 16`);
if (!expText.includes('EXPERIMENTS_EXECUTED:** 15')) fail('EXPERIMENTS_EXECUTED must be 15');
if (!expText.includes('EXPERIMENTS_PENDING:** 1')) fail('EXPERIMENTS_PENDING must be 1');

console.log('==> PR timeline uniqueness and required PRs');
const prText = read('research/PR_TIMELINE.md');
const prNumbers = [...prText.matchAll(/\| #(\d+) \|/g)].map((m) => m[1]);
const uniquePrs = new Set(prNumbers);
if (uniquePrs.size !== prNumbers.length) fail('Duplicate PR numbers in PR_TIMELINE');
for (const required of ['1505', '1507', '1511', '1529']) {
  if (!uniquePrs.has(required)) fail(`PR_TIMELINE missing required PR #${required}`);
}
const mergedCount = prNumbers.filter((n) => n !== '1544').length;
if (!prText.includes(`**RELEVANT_MERGED_PR_COUNT:** **${mergedCount}**`)) {
  fail(`PR_TIMELINE RELEVANT_MERGED_PR_COUNT should be ${mergedCount}`);
}

console.log('==> Cadence density canonical metrics');
const cadenceText = read('evidence/signal-inventory/CADENCE_DENSITY.md');
for (const token of [
  'RD002_SEALED_DT_P50_SECONDS',
  'RD002_SEALED_DT_P95_SECONDS',
  'RD002_SEALED_DT_MAX_SECONDS',
  'RD003_RELEVANT_MEDIAN_SECONDS',
  'RD002_AND_RD003_CADENCE_METRICS_SEMANTICALLY_SEPARATED = YES',
]) {
  if (!cadenceText.includes(token)) fail(`CADENCE_DENSITY.md missing ${token}`);
}

console.log('==> RD002 must not claim ~2s median in WORKSTREAM_HISTORY');
const wsText = read('WORKSTREAM_HISTORY.md');
if (/RD002[^\n]*~2s/i.test(wsText)) {
  fail('WORKSTREAM_HISTORY still attributes ~2s median to RD002');
}
if (wsText.includes('HF Recovery V2 exercised')) {
  fail('WORKSTREAM_HISTORY still contains anachronistic HF Recovery V2 label for RD002');
}

if (errors.length) {
  console.error('\n==> DOC VALIDATION FAILED');
  for (const e of errors) console.error('  -', e);
  process.exit(1);
}

console.log('==> All doc validations passed');
console.log(`  decisions evidence refs: ${evidenceIds.size}`);
console.log(`  hypotheses checked: ${hypIds.length}`);
console.log(`  defects: ${defectRows.length} (${fixedCount} fixed, ${openCount} open)`);
console.log(`  experiments: ${expRows.length} (15 executed, 1 pending)`);
console.log(`  merged PRs in timeline: ${mergedCount}`);
