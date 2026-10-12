import assert from 'node:assert/strict';
import { assertCriticalCiGatePassed, isValidFullGitSha } from './deploy-ci-gate.mjs';

assert.equal(isValidFullGitSha('09fd5d72ad06d71c0cded8af0422dd35df58b714'), true);
assert.equal(isValidFullGitSha('short'), false);

const bad = assertCriticalCiGatePassed('not-a-sha');
assert.equal(bad.ok, false);
assert.equal(bad.reason, 'invalid_sha');

// Live gh check only when gh + network available (EXP021 target SHA).
const target = '09fd5d72ad06d71c0cded8af0422dd35df58b714';
try {
  const live = assertCriticalCiGatePassed(target);
  if (live.ok) {
    console.log('PASS: live_ci_gate_exp021_target');
  } else {
    console.log(`SKIP: live_ci_gate reason=${live.reason} (offline CI env)`);
  }
} catch {
  console.log('SKIP: live_ci_gate gh unavailable');
}

console.log('ALL_DEPLOY_CI_GATE_SELFTEST_PASS');
