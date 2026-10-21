#!/usr/bin/env node
/** Compare JS replay core allow semantics vs fixture expectations (B2/B4). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPolicy } from './p25-apd-replay-policy-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'p25-apd-policy-parity.fixtures.json'), 'utf8'),
);

function jsAllow(policyId, c) {
  const policy = buildPolicy(policyId);
  const stats = { medianIntervalMs: c.medianIntervalMs || 8 * 3600 * 1000 };
  const ctx = {
    reconciliation: c.reconciliation,
    lastAllowedMs: c.lastAllowedMs,
    lastLvSourceMs: c.lastLvSourceMs,
    nowMs: c.nowMs,
  };
  if (policyId === 'B0_CONTROL') return true;
  return policy.decide(ctx, c.nowMs, c.profile, stats);
}

const results = { b2Mismatch: [], b4Mismatch: [] };
for (const c of fixtures.cases) {
  const b2 = jsAllow('B2_HB10_IN1', c);
  const b4 = jsAllow('B4_PHASE_30M', c);
  if (b2 !== c.b2) results.b2Mismatch.push({ id: c.id, expected: c.b2, got: b2 });
  if (b4 !== c.b4) results.b4Mismatch.push({ id: c.id, expected: c.b4, got: b4 });
}

console.log(
  JSON.stringify({
    POLICY_PARITY_CASE_COUNT: fixtures.cases.length,
    B2_POLICY_PARITY_MISMATCH_COUNT: results.b2Mismatch.length,
    B4_POLICY_PARITY_MISMATCH_COUNT: results.b4Mismatch.length,
    b2Mismatch: results.b2Mismatch,
    b4Mismatch: results.b4Mismatch,
  }),
);

process.exit(results.b2Mismatch.length + results.b4Mismatch.length > 0 ? 1 : 0);
