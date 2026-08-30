#!/usr/bin/env node
/**
 * Process-level validation probe for two running SynqDrive backend instances.
 * Reads /api/v1/health/readiness schedulerLeader state from both ports.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT_A = Number(process.env.REPLICA_A_PORT || 3010);
const PORT_B = Number(process.env.REPLICA_B_PORT || 3011);
const PID_A = Number(process.env.REPLICA_A_PID || 0);
const PID_B = Number(process.env.REPLICA_B_PID || 0);

const results = {
  leaderCountMax: 0,
  duplicateSingletonTicks: 0,
  gracefulFailoverMs: null,
  crashFailoverMs: null,
  splitBrainFound: false,
  observations: [],
};

async function fetchReadiness(port) {
  const res = await fetch(`http://127.0.0.1:${port}/api/v1/health/readiness`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`readiness ${port} HTTP ${res.status}`);
  return res.json();
}

function leaderRole(body) {
  return body?.checks?.schedulerLeader?.details?.role ?? 'UNKNOWN';
}

async function readinessRole(port) {
  try {
    const body = await fetchReadiness(port);
    return { port, role: leaderRole(body), body, reachable: true };
  } catch {
    return { port, role: 'UNREACHABLE', body: null, reachable: false };
  }
}

async function pollLeaders() {
  const [ra, rb] = await Promise.all([readinessRole(PORT_A), readinessRole(PORT_B)]);
  const roles = [ra.role, rb.role];
  const leaders = roles.filter((r) => r === 'LEADER').length;
  results.leaderCountMax = Math.max(results.leaderCountMax, leaders);
  if (leaders > 1) results.splitBrainFound = true;
  return { roles, leaders, a: ra.body, b: rb.body, reachable: [ra.reachable, rb.reachable] };
}

async function waitForBothReady(maxMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      await pollLeaders();
      return true;
    } catch {
      await sleep(2_000);
    }
  }
  throw new Error('timeout waiting for readiness on both replicas');
}

function killPid(pid, signal) {
  return new Promise((resolve, reject) => {
    if (!pid) return reject(new Error('missing pid'));
    const child = spawn('kill', [`-${signal}`, String(pid)], { stdio: 'ignore' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`kill exit ${code}`))));
  });
}

async function waitForSingleLeader(maxMs) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const { leaders, roles } = await pollLeaders();
      if (leaders === 1) {
        const leaderPort = roles[0] === 'LEADER' ? PORT_A : roles[1] === 'LEADER' ? PORT_B : null;
        if (leaderPort) {
          return { elapsedMs: Date.now() - start, leaderPort, roles };
        }
      }
    } catch {
      // transient while process restarts
    }
    await sleep(500);
  }
  throw new Error(`failover timeout after ${maxMs}ms`);
}

async function main() {
  console.log('==> Phase A: both replicas healthy');
  await waitForBothReady();
  for (let i = 0; i < 6; i += 1) {
    const { roles, leaders } = await pollLeaders();
    results.observations.push({ phase: 'steady', roles, leaders });
    await sleep(2_000);
  }
  console.log(JSON.stringify({ phase: 'steady', leaderCountMax: results.leaderCountMax }, null, 2));

  console.log('==> Phase B: graceful leader shutdown');
  let { roles } = await pollLeaders();
  const leaderIsA = roles[0] === 'LEADER';
  const leaderPid = leaderIsA ? PID_A : PID_B;
  const followerPid = leaderIsA ? PID_B : PID_A;
  if (!leaderPid || !followerPid) throw new Error('REPLICA_A_PID and REPLICA_B_PID required');

  const gracefulStart = Date.now();
  await killPid(leaderPid, 'TERM');
  const failover = await waitForSingleLeader(20_000);
  results.gracefulFailoverMs = Date.now() - gracefulStart;
  console.log(JSON.stringify({ phase: 'graceful_failover', ms: results.gracefulFailoverMs, ...failover }, null, 2));

  console.log('==> Phase C: hard-kill remaining leader');
  const remainingPid = failover.leaderPort === PORT_A ? PID_A : PID_B;
  const crashStart = Date.now();
  try {
    await killPid(remainingPid, 'KILL');
  } catch {
    // process may already be gone after graceful phase
  }
  try {
    const crashFailover = await waitForSingleLeader(25_000);
    results.crashFailoverMs = Date.now() - crashStart;
    console.log(JSON.stringify({ phase: 'crash_failover', ms: results.crashFailoverMs, ...crashFailover }, null, 2));
  } catch (err) {
    console.log(JSON.stringify({ phase: 'crash_failover', error: String(err) }, null, 2));
  }

  console.log('==> FINAL_PROBE_RESULTS');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
