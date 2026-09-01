#!/usr/bin/env node
/**
 * Production scheduler leader convergence gate (P1.8.3.1).
 * Polls readiness endpoints until exactly one stable leader or hard failure.
 */
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import {
  CANONICAL_REPLICA_COUNT,
  computeSchedulerConvergenceTimeoutMs,
  REPLICA_A_PORT,
  REPLICA_B_PORT,
  SCHEDULER_CONVERGENCE_DEFAULTS,
  waitForSchedulerLeaderConvergence,
} from './vps-multi-replica-deploy.util.mjs';

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv) {
  const args = {
    portA: REPLICA_A_PORT,
    portB: REPLICA_B_PORT,
    replicaCount: CANONICAL_REPLICA_COUNT,
    pollIntervalMs: SCHEDULER_CONVERGENCE_DEFAULTS.pollIntervalMs,
    timeoutMs: computeSchedulerConvergenceTimeoutMs(),
    requiredStableObservations: SCHEDULER_CONVERGENCE_DEFAULTS.requiredStableObservations,
  };

  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--port-a' && next) {
      args.portA = parsePositiveInt(next, args.portA);
      i++;
    } else if (token === '--port-b' && next) {
      args.portB = parsePositiveInt(next, args.portB);
      i++;
    } else if (token === '--replica-count' && next) {
      args.replicaCount = parsePositiveInt(next, args.replicaCount);
      i++;
    } else if (token === '--poll-interval-ms' && next) {
      args.pollIntervalMs = parsePositiveInt(next, args.pollIntervalMs);
      i++;
    } else if (token === '--timeout-ms' && next) {
      args.timeoutMs = parsePositiveInt(next, args.timeoutMs);
      i++;
    } else if (token === '--stable-observations' && next) {
      args.requiredStableObservations = parsePositiveInt(next, args.requiredStableObservations);
      i++;
    }
  }

  return args;
}

function readinessRole(port) {
  try {
    const body = execFileSync(
      'curl',
      ['-sf', `http://127.0.0.1:${port}/api/v1/health/readiness`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const json = JSON.parse(body);
    return json?.checks?.schedulerLeader?.details?.role ?? 'UNKNOWN';
  } catch {
    return 'UNREACHABLE';
  }
}

function observeLeaderCount(args) {
  const roles = [readinessRole(args.portA)];
  if (args.replicaCount >= 2) {
    roles.push(readinessRole(args.portB));
  }
  const leaderCount = roles.filter((role) => role === 'LEADER').length;
  process.stderr.write(
    `[scheduler-convergence] roles=${roles.join('/')} leaders=${leaderCount}\n`,
  );
  return leaderCount;
}

async function main() {
  const args = parseArgs(process.argv);

  const result = await waitForSchedulerLeaderConvergence({
    pollIntervalMs: args.pollIntervalMs,
    timeoutMs: args.timeoutMs,
    requiredStableObservations: args.requiredStableObservations,
    observeLeaderCount: () => observeLeaderCount(args),
  });

  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(
    `[scheduler-convergence] fatal: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(2);
});
