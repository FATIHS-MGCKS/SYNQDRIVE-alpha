import { Worker } from 'worker_threads';
import type { RoadMatchingPipelineInput, RoadMatchingPipelineResult } from '../s4-research/contracts';

type WorkerReply =
  | { ok: true; result: RoadMatchingPipelineResult }
  | { ok: false; error: string };

/**
 * Runs the CPU-heavy pipeline in a worker thread so deadlineMs can terminate it.
 * Promise.race alone does not stop synchronous Viterbi work on the main thread.
 */
export async function runRoadMatchingPipelineIsolated(
  input: RoadMatchingPipelineInput,
  deadlineMs: number,
): Promise<RoadMatchingPipelineResult> {
  const pipelineModule = require.resolve('../s4-research');
  const workerSource = `
    const { parentPort, workerData } = require('worker_threads');
    const { runRoadMatchingPipeline } = require(${JSON.stringify(pipelineModule)});
    try {
      const result = runRoadMatchingPipeline(workerData.input);
      parentPort.postMessage({ ok: true, result });
    } catch (e) {
      parentPort.postMessage({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  `;

  return new Promise<RoadMatchingPipelineResult>((resolve, reject) => {
    const worker = new Worker(workerSource, { eval: true, workerData: { input } });
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
      if (code !== 0) {
        finish(() => {
          clearTimeout(timer);
          reject(new Error(`PIPELINE_WORKER_EXIT_${code}`));
        });
      }
    });
  });
}
