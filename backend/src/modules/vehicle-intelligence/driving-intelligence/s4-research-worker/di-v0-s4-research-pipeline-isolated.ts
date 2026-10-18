import { existsSync } from 'fs';
import { join } from 'path';
import { Worker } from 'worker_threads';
import type { RoadMatchingPipelineInput, RoadMatchingPipelineResult } from '../s4-research/contracts';

type WorkerReply =
  | { ok: true; result: RoadMatchingPipelineResult }
  | { ok: false; error: string };

function resolvePipelineWorkerPath(): { script: string; execArgv?: string[] } {
  const js = join(__dirname, 'di-v0-s4-research-pipeline.worker.js');
  if (existsSync(js)) {
    return { script: js };
  }
  const ts = join(__dirname, 'di-v0-s4-research-pipeline.worker.ts');
  return {
    script: ts,
    execArgv: ['--require', 'ts-node/register/transpile-only'],
  };
}

/**
 * Runs the CPU-heavy pipeline in a worker thread so deadlineMs can terminate it.
 * Promise.race alone does not stop synchronous Viterbi work on the main thread.
 */
export async function runRoadMatchingPipelineIsolated(
  input: RoadMatchingPipelineInput,
  deadlineMs: number,
): Promise<RoadMatchingPipelineResult> {
  const { script, execArgv } = resolvePipelineWorkerPath();

  return new Promise<RoadMatchingPipelineResult>((resolve, reject) => {
    const worker = new Worker(script, { workerData: { input }, execArgv });
    const timer = setTimeout(() => {
      void worker.terminate();
      finish(() => reject(new Error('PROCESSING_TIMEOUT')));
    }, deadlineMs);
    worker.once('message', (msg: WorkerReply) => {
      finish(() => {
        clearTimeout(timer);
        if (msg.ok) resolve(msg.result);
        else reject(new Error(msg.error));
      });
    });
    worker.once('error', (err) => {
      finish(() => {
        clearTimeout(timer);
        reject(err);
      });
    });
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    worker.once('exit', (code) => {
      if (!settled && code !== 0) {
        finish(() => {
          clearTimeout(timer);
          reject(new Error(`PIPELINE_WORKER_EXIT_${code}`));
        });
      }
    });
  });
}
