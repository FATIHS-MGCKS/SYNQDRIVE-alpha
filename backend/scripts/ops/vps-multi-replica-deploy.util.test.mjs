import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertNoMixedSha,
  classifyLeaderCount,
  computeSchedulerConvergenceTimeoutMs,
  countSchedulerLeaders,
  evaluateReplicaDeployReadiness,
  expectedReplicaNames,
  nginxHasDualUpstream,
  processSchedulerConvergenceObservation,
  schedulerLeaderInvariant,
  shouldRollbackOnFailure,
  simulateSchedulerConvergence,
  waitForSchedulerLeaderConvergence,
} from './vps-multi-replica-deploy.util.mjs';

const TARGET = 'abc123def456';

test('assertNoMixedSha passes when both replicas match target', () => {
  const r = assertNoMixedSha(TARGET, TARGET, TARGET);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test('assertNoMixedSha fails on mixed replica SHAs', () => {
  const r = assertNoMixedSha(TARGET, 'oldsha999999', TARGET);
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('replica_b_sha_mismatch'));
  assert.ok(r.errors.includes('mixed_replica_sha'));
});

test('schedulerLeaderInvariant requires exactly one leader', () => {
  assert.equal(schedulerLeaderInvariant(['LEADER', 'FOLLOWER']).ok, true);
  assert.equal(schedulerLeaderInvariant(['LEADER', 'LEADER']).splitBrain, true);
  assert.equal(schedulerLeaderInvariant(['FOLLOWER', 'FOLLOWER']).noLeader, true);
  assert.equal(countSchedulerLeaders(['LEADER', 'FOLLOWER', 'UNREACHABLE']), 1);
});

test('evaluateReplicaDeployReadiness catches stale process and SHA mismatch', () => {
  const ok = evaluateReplicaDeployReadiness({
    synqdrive: {
      healthOk: true,
      readinessOk: true,
      portListening: true,
      uptimeSec: 30,
      maxUptimeSec: 300,
      releaseSha: TARGET,
      targetSha: TARGET,
    },
    'synqdrive-b': {
      healthOk: true,
      readinessOk: true,
      portListening: true,
      uptimeSec: 4000,
      maxUptimeSec: 300,
      releaseSha: 'oldsha',
      targetSha: TARGET,
    },
  });
  assert.equal(ok.ok, false);
  assert.ok(ok.errors.includes('synqdrive-b:stale_process_not_restarted'));
  assert.ok(ok.errors.includes('synqdrive-b:sha_mismatch'));
  assert.ok(ok.errors.includes('mixed_replica_sha'));
});

test('expectedReplicaNames includes secondary when replicaCount=2', () => {
  assert.deepEqual(
    expectedReplicaNames({ replicaCount: 2, replicaBPresent: true, nginxDualUpstream: true }),
    ['synqdrive', 'synqdrive-b'],
  );
});

test('shouldRollbackOnFailure on partial replica B deploy', () => {
  const r = shouldRollbackOnFailure({
    stage: 'replica_b',
    replicaAUpdated: true,
    replicaBUpdated: false,
    replicaBRequired: true,
  });
  assert.equal(r.rollback, true);
  assert.equal(r.reason, 'partial_deploy_replica_b_failed');
});

test('nginxHasDualUpstream detects canonical block', () => {
  const text = `upstream synqdrive_backend {
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}`;
  assert.equal(nginxHasDualUpstream(text), true);
  assert.equal(nginxHasDualUpstream('proxy_pass http://127.0.0.1:3001;'), false);
});

test('computeSchedulerConvergenceTimeoutMs uses documented formula', () => {
  assert.equal(
    computeSchedulerConvergenceTimeoutMs({
      acquireIntervalMs: 5000,
      replicaCount: 2,
      pollIntervalMs: 2000,
      marginMs: 10000,
    }),
    44000,
  );
});

test('classifyLeaderCount distinguishes transient zero, candidate, split brain', () => {
  assert.equal(classifyLeaderCount(0), 'TRANSIENT_ZERO');
  assert.equal(classifyLeaderCount(1), 'CANDIDATE');
  assert.equal(classifyLeaderCount(2), 'SPLIT_BRAIN');
});

test('CASE A: 0 → 0 → 1 converges with stable observations', () => {
  const result = simulateSchedulerConvergence([0, 0, 1, 1]);
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'CONVERGED');
});

test('CASE B: 0 → 1 converges after second stable observation', () => {
  const result = simulateSchedulerConvergence([0, 1, 1]);
  assert.equal(result.ok, true);
});

test('CASE C: single 1 does not pass when stable observations required', () => {
  const result = simulateSchedulerConvergence([1], { requiredStableObservations: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'FAIL_TIMEOUT');
});

test('CASE D: 0 → 0 → 0 until timeout fails', () => {
  const result = simulateSchedulerConvergence([0, 0, 0, 0]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'FAIL_TIMEOUT');
});

test('CASE E: 0 → 2 fails split brain immediately', () => {
  const result = simulateSchedulerConvergence([0, 2]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'FAIL_SPLIT_BRAIN');
});

test('CASE F: 1 → 0 resets stability and can still converge', () => {
  const step1 = processSchedulerConvergenceObservation({
    leaderCount: 1,
    stableObservations: 0,
    requiredStableObservations: 2,
  });
  assert.equal(step1.outcome, 'WAIT');
  assert.equal(step1.stableObservations, 1);

  const step2 = processSchedulerConvergenceObservation({
    leaderCount: 0,
    stableObservations: step1.stableObservations,
    requiredStableObservations: 2,
  });
  assert.equal(step2.outcome, 'WAIT');
  assert.equal(step2.stableObservations, 0);

  const result = simulateSchedulerConvergence([1, 0, 1, 1]);
  assert.equal(result.ok, true);
});

test('CASE G: 1 → 2 fails split brain', () => {
  const result = simulateSchedulerConvergence([1, 2]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'FAIL_SPLIT_BRAIN');
});

test('CASE H: observe failure returns OBSERVE_FAILED', async () => {
  const result = await waitForSchedulerLeaderConvergence({
    observeLeaderCount: async () => {
      throw new Error('curl_failed');
    },
    timeoutMs: 1000,
    pollIntervalMs: 10,
    now: () => 0,
    sleep: async () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'OBSERVE_FAILED');
  assert.match(result.error, /curl_failed/);
});

test('waitForSchedulerLeaderConvergence times out without real delay', async () => {
  let nowMs = 0;
  const observations = [0, 0, 0];
  let idx = 0;

  const result = await waitForSchedulerLeaderConvergence({
    observeLeaderCount: () => observations[Math.min(idx++, observations.length - 1)],
    timeoutMs: 50,
    pollIntervalMs: 20,
    requiredStableObservations: 2,
    now: () => nowMs,
    sleep: async (ms) => {
      nowMs += ms;
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'FAIL_TIMEOUT');
  assert.ok(result.attempts >= 2);
});
