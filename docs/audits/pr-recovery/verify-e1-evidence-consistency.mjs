#!/usr/bin/env node
// E1 evidence consistency validator (Phase 3 E1.2).
// Checks the three evidence artifacts exist, the JSON parses, the tested SHA is
// consistent across all reports, the failure counts agree, and the reports cover
// the required gates and phases. Exit non-zero on any inconsistency.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const AB_JSON = join(dir, 'phase3-e1-ab-baseline-validation-2026-08.json');
const AB_MD = join(dir, 'phase3-e1-ab-baseline-validation-2026-08.md');
const TEST_MD = join(dir, 'phase3-e1-contract-correction-test-report-2026-08.md');
const IMPL_MD = join(dir, 'phase3-e1-evaluations-contracts-implementation-2026-08.md');

const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };

for (const f of [AB_JSON, AB_MD, TEST_MD, IMPL_MD]) {
  check(existsSync(f), `missing report: ${f}`);
}
if (problems.length) { report(); }

let json;
try {
  json = JSON.parse(readFileSync(AB_JSON, 'utf8'));
} catch (e) {
  problems.push(`A/B JSON not parseable: ${e.message}`);
  report();
}

const testedSha = json.e1Sha;
check(typeof testedSha === 'string' && testedSha.length >= 40, 'JSON e1Sha missing/short');

const abMd = readFileSync(AB_MD, 'utf8');
const testMd = readFileSync(TEST_MD, 'utf8');
const implMd = readFileSync(IMPL_MD, 'utf8');

const shortSha = testedSha.slice(0, 8);
check(abMd.includes(testedSha) || abMd.includes(shortSha), 'A/B markdown does not name tested SHA');
check(testMd.includes(testedSha) || testMd.includes(shortSha), 'test report does not name tested SHA');
check(implMd.includes(testedSha) || implMd.includes(shortSha), 'implementation report does not name tested SHA');

// Failure-count consistency.
check(json.summary.newE1Failure === 0, `JSON newE1Failure != 0 (${json.summary.newE1Failure})`);
check(json.summary.unknown === 0, `JSON unknown != 0 (${json.summary.unknown})`);
check(/NEW_E1_FAILURE_COUNT:\s*0/.test(abMd), 'A/B markdown NEW_E1_FAILURE_COUNT != 0');
check(/UNKNOWN_COUNT:\s*0/.test(abMd), 'A/B markdown UNKNOWN_COUNT != 0');
check(/NEW_E1_FAILURE`?:?\s*\**0/.test(testMd), 'test report NEW_E1_FAILURE != 0');

// Required gates in the test report.
const requiredGates = [
  'Comparison single source', 'Registry-aware validation', 'Time dependency direction',
  'Period reference invariant', 'Value-type COUNT', 'DataCoverage', 'Money EUR', 'Money USD',
  'Money invalid currency', 'DST forward/backward', 'Mirror / contract sync',
  'No-new-routes', 'No-DB-change', 'Scope leak',
];
for (const g of requiredGates) {
  check(testMd.includes(g), `test report missing gate: ${g}`);
}

// Implementation report must include E1.1 and E1.2 sections.
check(/E1\.1 Post-Implementation Correction Pass/.test(implMd), 'implementation report missing E1.1 section');
check(/E1\.2 Final Evidence & CI Closure/.test(implMd), 'implementation report missing E1.2 section');

// Final status present.
check(/E1_READY_FOR_FINAL_MERGE_AUDIT/.test(testMd), 'test report missing final status');
check(/E1_READY_FOR_FINAL_MERGE_AUDIT/.test(implMd), 'implementation report missing final status');

report();

function report() {
  if (problems.length) {
    console.error('E1 evidence consistency: FAIL');
    for (const p of problems) console.error(` - ${p}`);
    process.exit(1);
  }
  console.log(`E1 evidence consistency: PASS (tested SHA ${json?.e1Sha ?? 'n/a'})`);
  process.exit(0);
}
