import assert from 'node:assert/strict';
import {
  assertCriticalCiGatePassed,
  buildCommitCheckRunsApiEndpoint,
  CRITICAL_GATE_NAME,
  evaluateCriticalGateFromCheckRuns,
  fetchAllCheckRunsForCommit,
  isValidFullGitSha,
  latestCheckRunPerName,
} from './deploy-ci-gate.mjs';

const SHA = '09fd5d72ad06d71c0cded8af0422dd35df58b714';

assert.equal(
  buildCommitCheckRunsApiEndpoint('ORG/REPO', SHA, 2, 50),
  `repos/ORG/REPO/commits/${SHA}/check-runs?per_page=50&page=2`,
);
assert.equal(buildCommitCheckRunsApiEndpoint('ORG/REPO', SHA, 1).includes('-f'), false);

const calls = [];
const mockGh = (ghBin, args) => {
  calls.push(args);
  const endpoint = args[1];
  if (endpoint.endsWith('page=1')) {
    return JSON.stringify({
      total_count: 2,
      check_runs: [
        { name: 'other', status: 'completed', conclusion: 'success', completed_at: '2026-01-01T00:00:00Z' },
      ],
    });
  }
  if (endpoint.endsWith('page=2')) {
    return JSON.stringify({
      total_count: 2,
      check_runs: [
        {
          name: CRITICAL_GATE_NAME,
          status: 'completed',
          conclusion: 'success',
          completed_at: '2026-01-02T00:00:00Z',
        },
      ],
    });
  }
  throw new Error(`unexpected endpoint ${endpoint}`);
};

const paged = fetchAllCheckRunsForCommit(SHA, {
  repo: 'ORG/REPO',
  ghBin: 'gh-mock',
  execFileSync: mockGh,
});
assert.equal(paged.length, 2);
assert.equal(calls.length, 2);
assert.equal(calls[0][0], 'api');
assert.equal(calls[0][1].includes('?per_page=100&page=1'), true);
assert.equal(calls[1][1].includes('page=2'), true);

const gh404 = () => {
  const err = new Error('gh: HTTP 404');
  err.stderr = 'Not Found';
  throw err;
};
const failed = assertCriticalCiGatePassed(SHA, { execFileSync: gh404, ghBin: 'gh-mock' });
assert.equal(failed.ok, false);
assert.equal(failed.reason, 'gh_api_failed');
assert.match(failed.detail ?? '', /404/);

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

try {
  const live = assertCriticalCiGatePassed(SHA);
  if (live.ok) {
    console.log('PASS: live_ci_gate_exp021_target');
  } else {
    console.log(`SKIP: live_ci_gate reason=${live.reason}`);
  }
} catch {
  console.log('SKIP: live_ci_gate gh unavailable');
}

console.log('ALL_DEPLOY_CI_GATE_SELFTEST_PASS');
