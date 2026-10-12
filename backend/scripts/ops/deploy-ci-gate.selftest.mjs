import assert from 'node:assert/strict';
import {
  assertCriticalCiGatePassed,
  CRITICAL_GATE_NAME,
  evaluateCriticalGateFromCheckRuns,
  isValidFullGitSha,
  latestCheckRunPerName,
} from './deploy-ci-gate.mjs';

assert.equal(isValidFullGitSha('09fd5d72ad06d71c0cded8af0422dd35df58b714'), true);
assert.equal(isValidFullGitSha('short'), false);

const bad = assertCriticalCiGatePassed('not-a-sha');
assert.equal(bad.ok, false);
assert.equal(bad.reason, 'invalid_sha');

const multi = evaluateCriticalGateFromCheckRuns([
  {
    name: CRITICAL_GATE_NAME,
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-10-12T10:00:00Z',
    completed_at: '2026-10-12T10:05:00Z',
  },
  {
    name: CRITICAL_GATE_NAME,
    status: 'completed',
    conclusion: 'failure',
    started_at: '2026-10-12T12:00:00Z',
    completed_at: '2026-10-12T12:02:00Z',
  },
]);
assert.equal(multi.ok, false);
assert.equal(multi.reason, 'critical_gate_not_success');

const latestOnly = evaluateCriticalGateFromCheckRuns([
  {
    name: CRITICAL_GATE_NAME,
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-10-12T12:00:00Z',
    completed_at: '2026-10-12T12:02:00Z',
  },
  {
    name: CRITICAL_GATE_NAME,
    status: 'completed',
    conclusion: 'failure',
    started_at: '2026-10-12T10:00:00Z',
    completed_at: '2026-10-12T10:05:00Z',
  },
]);
assert.equal(latestOnly.ok, true);

const inProgress = evaluateCriticalGateFromCheckRuns([
  {
    name: CRITICAL_GATE_NAME,
    status: 'in_progress',
    conclusion: null,
    started_at: '2026-10-12T12:00:00Z',
  },
]);
assert.equal(inProgress.ok, false);
assert.equal(inProgress.reason, 'critical_gate_not_completed');

const cancelled = evaluateCriticalGateFromCheckRuns([
  {
    name: CRITICAL_GATE_NAME,
    status: 'completed',
    conclusion: 'cancelled',
    started_at: '2026-10-12T12:00:00Z',
    completed_at: '2026-10-12T12:01:00Z',
  },
]);
assert.equal(cancelled.ok, false);

const byName = latestCheckRunPerName([
  { name: 'other', status: 'completed', conclusion: 'success', completed_at: '2026-01-01T00:00:00Z' },
  { name: CRITICAL_GATE_NAME, status: 'completed', conclusion: 'success', completed_at: '2026-01-02T00:00:00Z' },
]);
assert.equal(byName.get(CRITICAL_GATE_NAME)?.conclusion, 'success');

const target = '09fd5d72ad06d71c0cded8af0422dd35df58b714';
try {
  const live = assertCriticalCiGatePassed(target);
  if (live.ok) {
    console.log('PASS: live_ci_gate_exp021_target');
  } else {
    console.log(`SKIP: live_ci_gate reason=${live.reason}`);
  }
} catch {
  console.log('SKIP: live_ci_gate gh unavailable');
}

console.log('ALL_DEPLOY_CI_GATE_SELFTEST_PASS');
