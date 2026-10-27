import assert from 'node:assert/strict';
import {
  assertCriticalCiGatePassed,
  buildCommitCheckRunsApiEndpoint,
  CANONICAL_DEPLOY_GATE_WORKFLOW_PATH,
  CRITICAL_GATE_NAME,
  evaluateCriticalGateFromCheckRuns,
  fetchAllCheckRunsForCommit,
  isValidFullGitSha,
  latestCheckRunPerName,
  parseGithubActionsRunIdFromDetailsUrl,
} from './deploy-ci-gate.mjs';

const SHA = '09fd5d72ad06d71c0cded8af0422dd35df58b714';
const VEHICLE = CANONICAL_DEPLOY_GATE_WORKFLOW_PATH;
const LEGAL = '.github/workflows/legal-documents-production-readiness.yml';

const vehicleUrl = (runId) =>
  `https://github.com/ORG/REPO/actions/runs/${runId}/job/1`;
const legalUrl = (runId) =>
  `https://github.com/ORG/REPO/actions/runs/${runId}/job/2`;

const pathMap = (entries) =>
  Object.fromEntries(entries.map(([id, path]) => [String(id), path]));

assert.equal(
  buildCommitCheckRunsApiEndpoint('ORG/REPO', SHA, 2, 50),
  `repos/ORG/REPO/commits/${SHA}/check-runs?per_page=50&page=2`,
);
assert.equal(buildCommitCheckRunsApiEndpoint('ORG/REPO', SHA, 1).includes('-f'), false);

assert.equal(parseGithubActionsRunIdFromDetailsUrl(vehicleUrl(40573450839)), '40573450839');
assert.equal(parseGithubActionsRunIdFromDetailsUrl(''), null);

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
          details_url: vehicleUrl(9001),
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

const vehicleOnlyFail = evaluateCriticalGateFromCheckRuns(
  [
    {
      name: CRITICAL_GATE_NAME,
      status: 'completed',
      conclusion: 'failure',
      started_at: '2026-10-12T12:00:00Z',
      completed_at: '2026-10-12T12:02:00Z',
      details_url: vehicleUrl(1),
    },
  ],
  { workflowPathByRunId: pathMap([[1, VEHICLE]]) },
);
assert.equal(vehicleOnlyFail.ok, false);
assert.equal(vehicleOnlyFail.reason, 'critical_gate_not_success');

const vehicleSuccessLegalSkipped = evaluateCriticalGateFromCheckRuns(
  [
    {
      name: CRITICAL_GATE_NAME,
      status: 'completed',
      conclusion: 'success',
      started_at: '2026-10-12T10:00:00Z',
      completed_at: '2026-10-12T10:05:00Z',
      details_url: vehicleUrl(100),
    },
    {
      name: CRITICAL_GATE_NAME,
      status: 'completed',
      conclusion: 'skipped',
      started_at: '2026-10-12T12:00:00Z',
      completed_at: '2026-10-12T12:02:00Z',
      details_url: legalUrl(200),
    },
  ],
  { workflowPathByRunId: pathMap([[100, VEHICLE], [200, LEGAL]]) },
);
assert.equal(vehicleSuccessLegalSkipped.ok, true);

const vehicleFailedLegalSuccess = evaluateCriticalGateFromCheckRuns(
  [
    {
      name: CRITICAL_GATE_NAME,
      status: 'completed',
      conclusion: 'failure',
      started_at: '2026-10-12T12:00:00Z',
      completed_at: '2026-10-12T12:02:00Z',
      details_url: vehicleUrl(101),
    },
    {
      name: CRITICAL_GATE_NAME,
      status: 'completed',
      conclusion: 'success',
      started_at: '2026-10-12T13:00:00Z',
      completed_at: '2026-10-12T13:02:00Z',
      details_url: legalUrl(201),
    },
  ],
  { workflowPathByRunId: pathMap([[101, VEHICLE], [201, LEGAL]]) },
);
assert.equal(vehicleFailedLegalSuccess.ok, false);
assert.equal(vehicleFailedLegalSuccess.reason, 'critical_gate_not_success');

const missingCanonical = evaluateCriticalGateFromCheckRuns(
  [
    {
      name: CRITICAL_GATE_NAME,
      status: 'completed',
      conclusion: 'success',
      details_url: legalUrl(300),
    },
  ],
  { workflowPathByRunId: pathMap([[300, LEGAL]]) },
);
assert.equal(missingCanonical.ok, false);
assert.equal(missingCanonical.reason, 'critical_gate_check_run_missing');

const pendingCanonical = evaluateCriticalGateFromCheckRuns(
  [
    {
      name: CRITICAL_GATE_NAME,
      status: 'in_progress',
      conclusion: null,
      started_at: '2026-10-12T12:00:00Z',
      details_url: vehicleUrl(400),
    },
  ],
  { workflowPathByRunId: pathMap([[400, VEHICLE]]) },
);
assert.equal(pendingCanonical.ok, false);
assert.equal(pendingCanonical.reason, 'critical_gate_not_completed');

const unverifiableIdentity = evaluateCriticalGateFromCheckRuns(
  [
    {
      name: CRITICAL_GATE_NAME,
      status: 'completed',
      conclusion: 'success',
      details_url: vehicleUrl(500),
    },
  ],
  { workflowPathByRunId: pathMap([[500, null]]) },
);
assert.equal(unverifiableIdentity.ok, false);
assert.equal(unverifiableIdentity.reason, 'canonical_gate_workflow_identity_unverifiable');

const noGateRuns = evaluateCriticalGateFromCheckRuns(
  [{ name: 'Lint', status: 'completed', conclusion: 'success' }],
  { workflowPathByRunId: {} },
);
assert.equal(noGateRuns.ok, false);
assert.equal(noGateRuns.reason, 'critical_gate_check_run_missing');

const latestAmongCanonicalOnly = evaluateCriticalGateFromCheckRuns(
  [
    {
      name: CRITICAL_GATE_NAME,
      status: 'completed',
      conclusion: 'success',
      started_at: '2026-10-12T10:00:00Z',
      completed_at: '2026-10-12T10:05:00Z',
      details_url: vehicleUrl(600),
    },
    {
      name: CRITICAL_GATE_NAME,
      status: 'completed',
      conclusion: 'failure',
      started_at: '2026-10-12T12:00:00Z',
      completed_at: '2026-10-12T12:02:00Z',
      details_url: vehicleUrl(601),
    },
  ],
  { workflowPathByRunId: pathMap([[600, VEHICLE], [601, VEHICLE]]) },
);
assert.equal(latestAmongCanonicalOnly.ok, false);
assert.equal(latestAmongCanonicalOnly.reason, 'critical_gate_not_success');

const byName = latestCheckRunPerName([
  { name: 'other', status: 'completed', conclusion: 'success', completed_at: '2026-01-01T00:00:00Z' },
  {
    name: CRITICAL_GATE_NAME,
    status: 'completed',
    conclusion: 'success',
    completed_at: '2026-01-02T00:00:00Z',
  },
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
