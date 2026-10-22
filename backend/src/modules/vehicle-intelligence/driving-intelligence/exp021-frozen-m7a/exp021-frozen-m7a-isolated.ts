import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'worker_threads';
import type { ResearchGpsBucket } from '../s4-research/contracts';
import type { Match } from './exp021-frozen-m7a-decoder';

type WorkerReply =
  | { ok: true; matches: Match[]; cpuMs: number }
  | { ok: false; error: string };

function resolveWorkerPath(): { script: string; execArgv?: string[] } {
  const js = join(__dirname, 'exp021-frozen-m7a-isolated.worker.js');
  if (existsSync(js)) {
    return { script: js };
  }
  const ts = join(__dirname, 'exp021-frozen-m7a-isolated.worker.ts');
  return {
    script: ts,
    execArgv: ['--require', 'ts-node/register/transpile-only'],
  };
}

/** CPU-bound M7A decode in a worker thread so deadlineMs can terminate a hung run. */
export async function runFrozenM7aIsolated(
  input: {
    buckets: ResearchGpsBucket[];
    overpassBody: { elements?: unknown[] };
    corridorMarginM: number;
  },
  deadlineMs: number,
): Promise<{ matches: Match[]; cpuMs: number }> {
  const { script, execArgv } = resolveWorkerPath();

  return new Promise((resolve, reject) => {
    const worker = new Worker(script, { workerData: input, execArgv });
    const timer = setTimeout(() => {
      void worker.terminate();
      finish(() => reject(new Error('M7A_PROCESSING_TIMEOUT')));
    }, deadlineMs);

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    worker.once('message', (msg: WorkerReply) => {
      finish(() => {
        clearTimeout(timer);
        if (msg.ok) resolve({ matches: msg.matches, cpuMs: msg.cpuMs });
        else reject(new Error(msg.error));
      });
    });
    worker.once('error', (err) => {
      finish(() => {
        clearTimeout(timer);
        reject(err);
      });
    });
    worker.once('exit', (code) => {
      if (!settled && code !== 0) {
        finish(() => {
          clearTimeout(timer);
          reject(new Error(`M7A_WORKER_EXIT_${code}`));
        });
      }
    });
  });
}
