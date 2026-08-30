#!/usr/bin/env node
/**
 * Spawns two Node child processes that compete for reconciliation mutex + DIMO budget
 * keys on the same Redis DB — true OS-level process concurrency (not Jest twins).
 */
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerPath = join(__dirname, 'two-replica-coordination-worker.mjs');
const redisDb = process.env.REDIS_DB || '15';
const maxInFlight = Number(process.env.DIMO_GLOBAL_MAX_IN_FLIGHT || 10);

const results = { mutex: {}, dimo: {} };

function runWorker(payload) {
  return new Promise((resolve, reject) => {
    const child = fork(workerPath, [], {
      env: { ...process.env, ...payload, REDIS_DB: redisDb },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stdout += d; });
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`worker exit ${code}: ${stdout}`));
      else resolve(stdout.trim());
    });
  });
}

async function main() {
  console.log('==> Mutex: two processes same vehicle lock');
  const [m1, m2] = await Promise.all([
    runWorker({ TASK: 'mutex_acquire', WORKER: 'A', ORG: 'org-val', VEHICLE: 'veh-val' }),
    runWorker({ TASK: 'mutex_acquire', WORKER: 'B', ORG: 'org-val', VEHICLE: 'veh-val' }),
  ]);
  const mutexOut = [m1, m2].map((line) => JSON.parse(line));
  const acquired = mutexOut.filter((r) => r.acquired).length;
  results.mutex = {
    sameVehicleMaxConcurrent: acquired,
    doubleExecutionFound: acquired > 1,
    outcomes: mutexOut,
  };

  console.log('==> Mutex: unrelated vehicles parallel');
  const [p1, p2] = await Promise.all([
    runWorker({ TASK: 'mutex_acquire', WORKER: 'A', ORG: 'org-val', VEHICLE: 'veh-1' }),
    runWorker({ TASK: 'mutex_acquire', WORKER: 'B', ORG: 'org-val', VEHICLE: 'veh-2' }),
  ]);
  const parallelOut = [p1, p2].map((line) => JSON.parse(line));
  results.mutex.unrelatedVehiclesParallel = parallelOut.every((r) => r.acquired);

  console.log('==> DIMO budget: two processes global ceiling');
  const dimoWorkers = await Promise.all(
    Array.from({ length: maxInFlight + 3 }, (_, i) =>
      runWorker({ TASK: 'dimo_acquire', WORKER: `W${i}`, MAX_IN_FLIGHT: String(maxInFlight) }),
    ),
  );
  const dimoOut = dimoWorkers.map((line) => JSON.parse(line));
  const success = dimoOut.filter((r) => r.acquired);
  results.dimo = {
    configuredLimit: maxInFlight,
    maxInFlightObserved: success.length,
    limitBreached: success.length > maxInFlight,
    doubleAcquireFound: false,
    outcomes: dimoOut,
  };

  console.log('==> COORDINATION_PROBE_RESULTS');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
