/**
 * Pure deployment invariant helpers — unit-tested without production mutation.
 */

export const CANONICAL_REPLICA_COUNT = 2;
export const REPLICA_A_PORT = 3001;
export const REPLICA_B_PORT = 3002;

/**
 * Bounded scheduler leader convergence during deploy.
 *
 * Rationale (P1.7 defaults: acquireIntervalMs=5000, renewIntervalMs=10000, leaseMs=30000):
 * - After rolling restart both replicas report FOLLOWER until acquire loop wins Redis lease.
 * - leaderCount=0 is safe transiently; leaderCount>1 is never safe to wait through.
 * - P1.8.3 INC-06: single snapshot at ~2s after B healthy saw 0 leaders; converged later.
 *
 * Timeout = (2 * replicaCount + 2) * acquireInterval + 2 * pollInterval + margin
 * → 44000ms default for 2 replicas (not a blind sleep; poll until PASS or timeout).
 */
export const SCHEDULER_CONVERGENCE_DEFAULTS = {
  acquireIntervalMs: 5000,
  pollIntervalMs: 2000,
  requiredStableObservations: 2,
  marginMs: 10000,
};

/**
 * @param {{ acquireIntervalMs?: number; replicaCount?: number; pollIntervalMs?: number; marginMs?: number }} params
 */
export function computeSchedulerConvergenceTimeoutMs({
  acquireIntervalMs = SCHEDULER_CONVERGENCE_DEFAULTS.acquireIntervalMs,
  replicaCount = CANONICAL_REPLICA_COUNT,
  pollIntervalMs = SCHEDULER_CONVERGENCE_DEFAULTS.pollIntervalMs,
  marginMs = SCHEDULER_CONVERGENCE_DEFAULTS.marginMs,
} = {}) {
  const acquireCycles = 2 * replicaCount + 2;
  return acquireCycles * acquireIntervalMs + 2 * pollIntervalMs + marginMs;
}

/**
 * @param {number} leaderCount
 * @returns {'TRANSIENT_ZERO' | 'CANDIDATE' | 'SPLIT_BRAIN'}
 */
export function classifyLeaderCount(leaderCount) {
  if (leaderCount > 1) return 'SPLIT_BRAIN';
  if (leaderCount === 1) return 'CANDIDATE';
  return 'TRANSIENT_ZERO';
}

/**
 * Single convergence step (pure, for tests).
 *
 * @param {{ leaderCount: number; stableObservations: number; requiredStableObservations: number }} input
 */
export function processSchedulerConvergenceObservation({
  leaderCount,
  stableObservations,
  requiredStableObservations,
}) {
  const kind = classifyLeaderCount(leaderCount);

  if (kind === 'SPLIT_BRAIN') {
    return {
      outcome: 'FAIL_SPLIT_BRAIN',
      stableObservations: 0,
      kind,
    };
  }

  if (kind === 'CANDIDATE') {
    const nextStable = stableObservations + 1;
    if (nextStable >= requiredStableObservations) {
      return {
        outcome: 'PASS',
        stableObservations: nextStable,
        kind,
      };
    }
    return {
      outcome: 'WAIT',
      stableObservations: nextStable,
      kind,
    };
  }

  return {
    outcome: 'WAIT',
    stableObservations: 0,
    kind,
  };
}

/**
 * Drive convergence from a sequence of leader counts (pure, for tests).
 *
 * @param {number[]} leaderCounts
 * @param {{ requiredStableObservations?: number }} options
 */
export function simulateSchedulerConvergence(leaderCounts, options = {}) {
  const requiredStableObservations =
    options.requiredStableObservations ?? SCHEDULER_CONVERGENCE_DEFAULTS.requiredStableObservations;
  let stableObservations = 0;
  const trace = [];

  for (let i = 0; i < leaderCounts.length; i++) {
    const leaderCount = leaderCounts[i];
    const step = processSchedulerConvergenceObservation({
      leaderCount,
      stableObservations,
      requiredStableObservations,
    });
    trace.push({ index: i, leaderCount, ...step });
    stableObservations = step.stableObservations;

    if (step.outcome === 'FAIL_SPLIT_BRAIN') {
      return { ok: false, reason: 'FAIL_SPLIT_BRAIN', leaderCount, attempts: i + 1, trace };
    }
    if (step.outcome === 'PASS') {
      return {
        ok: true,
        reason: 'CONVERGED',
        leaderCount,
        attempts: i + 1,
        stableObservations,
        trace,
      };
    }
  }

  const last = leaderCounts.length ? leaderCounts[leaderCounts.length - 1] : null;
  return {
    ok: false,
    reason: 'FAIL_TIMEOUT',
    leaderCount: last,
    attempts: leaderCounts.length,
    trace,
  };
}

/**
 * @param {Array<'LEADER'|'FOLLOWER'|'UNREACHABLE'|'UNKNOWN'>} roles
 */
export function rolesToLeaderCount(roles) {
  return countSchedulerLeaders(roles);
}

/**
 * Bounded async convergence gate for production polling.
 *
 * @param {{
 *   observeLeaderCount: () => Promise<number> | number;
 *   pollIntervalMs?: number;
 *   timeoutMs?: number;
 *   requiredStableObservations?: number;
 *   now?: () => number;
 *   sleep?: (ms: number) => Promise<void>;
 * }} params
 */
export async function waitForSchedulerLeaderConvergence({
  observeLeaderCount,
  pollIntervalMs = SCHEDULER_CONVERGENCE_DEFAULTS.pollIntervalMs,
  timeoutMs = computeSchedulerConvergenceTimeoutMs(),
  requiredStableObservations = SCHEDULER_CONVERGENCE_DEFAULTS.requiredStableObservations,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const deadline = now() + timeoutMs;
  let stableObservations = 0;
  let attempts = 0;
  const trace = [];
  let lastLeaderCount = null;

  while (now() < deadline) {
    attempts += 1;
    let leaderCount;
    try {
      leaderCount = await observeLeaderCount();
      lastLeaderCount = leaderCount;
    } catch (error) {
      return {
        ok: false,
        reason: 'OBSERVE_FAILED',
        error: error instanceof Error ? error.message : String(error),
        attempts,
        trace,
      };
    }

    const step = processSchedulerConvergenceObservation({
      leaderCount,
      stableObservations,
      requiredStableObservations,
    });
    trace.push({ attempt: attempts, leaderCount, ...step });
    stableObservations = step.stableObservations;

    if (step.outcome === 'FAIL_SPLIT_BRAIN') {
      return {
        ok: false,
        reason: 'FAIL_SPLIT_BRAIN',
        leaderCount,
        attempts,
        trace,
      };
    }
    if (step.outcome === 'PASS') {
      return {
        ok: true,
        reason: 'CONVERGED',
        leaderCount,
        attempts,
        stableObservations,
        trace,
      };
    }

    if (now() >= deadline) {
      break;
    }
    await sleep(pollIntervalMs);
  }

  return {
    ok: false,
    reason: 'FAIL_TIMEOUT',
    leaderCount: lastLeaderCount,
    attempts,
    trace,
  };
}

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
