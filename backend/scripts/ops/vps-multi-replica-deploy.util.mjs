/**
 * Pure deployment invariant helpers — unit-tested without production mutation.
 */

export const CANONICAL_REPLICA_COUNT = 2;
export const REPLICA_A_PORT = 3001;
export const REPLICA_B_PORT = 3002;

/**
 * @param {string} replicaASha
 * @param {string} replicaBSha
 * @param {string} targetSha
 */
export function assertNoMixedSha(replicaASha, replicaBSha, targetSha) {
  const errors = [];
  if (!replicaASha || !replicaBSha || !targetSha) {
    errors.push('missing_sha');
  }
  if (replicaASha !== targetSha) {
    errors.push('replica_a_sha_mismatch');
  }
  if (replicaBSha !== targetSha) {
    errors.push('replica_b_sha_mismatch');
  }
  if (replicaASha !== replicaBSha) {
    errors.push('mixed_replica_sha');
  }
  return {
    ok: errors.length === 0,
    errors,
  };
}

/**
 * @param {Array<'LEADER'|'FOLLOWER'|'UNREACHABLE'|'UNKNOWN'>} roles
 */
export function countSchedulerLeaders(roles) {
  return roles.filter((r) => r === 'LEADER').length;
}

/**
 * @param {Array<'LEADER'|'FOLLOWER'|'UNREACHABLE'|'UNKNOWN'>} roles
 */
export function schedulerLeaderInvariant(roles) {
  const leaderCount = countSchedulerLeaders(roles);
  return {
    ok: leaderCount === 1,
    leaderCount,
    splitBrain: leaderCount > 1,
    noLeader: leaderCount === 0,
  };
}

/**
 * @param {Record<string, { healthOk: boolean; readinessOk: boolean; portListening: boolean; uptimeSec: number; maxUptimeSec: number; releaseSha: string; targetSha: string }>} replicas
 */
export function evaluateReplicaDeployReadiness(replicas) {
  const names = Object.keys(replicas);
  const errors = [];

  for (const name of names) {
    const r = replicas[name];
    if (!r.portListening) errors.push(`${name}:port_not_listening`);
    if (!r.healthOk) errors.push(`${name}:health_fail`);
    if (!r.readinessOk) errors.push(`${name}:readiness_fail`);
    if (r.releaseSha !== r.targetSha) errors.push(`${name}:sha_mismatch`);
    if (r.uptimeSec > r.maxUptimeSec) errors.push(`${name}:stale_process_not_restarted`);
  }

  const shas = names.map((n) => replicas[n].releaseSha);
  const uniqueShas = new Set(shas);
  if (uniqueShas.size > 1) {
    errors.push('mixed_replica_sha');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * @param {{ replicaCount: number; replicaBPresent: boolean; nginxDualUpstream: boolean }} topology
 */
export function expectedReplicaNames(topology) {
  const names = ['synqdrive'];
  if (topology.replicaCount >= 2) {
    names.push('synqdrive-b');
  }
  return names;
}

/**
 * @param {{ stage: string; replicaAUpdated: boolean; replicaBUpdated: boolean; replicaBRequired: boolean }} ctx
 */
export function shouldRollbackOnFailure(ctx) {
  if (ctx.stage === 'replica_b' && ctx.replicaAUpdated && ctx.replicaBRequired) {
    return { rollback: true, reason: 'partial_deploy_replica_b_failed' };
  }
  if (ctx.stage === 'final_verify') {
    return { rollback: true, reason: 'post_deploy_invariant_failed' };
  }
  if (ctx.stage === 'replica_a') {
    return { rollback: true, reason: 'replica_a_failed_before_cutover_complete' };
  }
  return { rollback: false, reason: null };
}

/**
 * @param {string} nginxText
 */
export function nginxHasDualUpstream(nginxText) {
  return (
    nginxText.includes('upstream synqdrive_backend') &&
    nginxText.includes('127.0.0.1:3001') &&
    nginxText.includes('127.0.0.1:3002')
  );
}
