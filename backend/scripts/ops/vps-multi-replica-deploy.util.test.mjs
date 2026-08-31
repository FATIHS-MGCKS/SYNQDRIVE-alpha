import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertNoMixedSha,
  countSchedulerLeaders,
  evaluateReplicaDeployReadiness,
  expectedReplicaNames,
  nginxHasDualUpstream,
  schedulerLeaderInvariant,
  shouldRollbackOnFailure,
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
