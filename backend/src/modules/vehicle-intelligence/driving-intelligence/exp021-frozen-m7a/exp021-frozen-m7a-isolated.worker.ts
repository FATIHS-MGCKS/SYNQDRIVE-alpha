import { parentPort, workerData } from 'worker_threads';
import { buildM7aRuntimeContext, runFrozenM7a, type Match } from './exp021-frozen-m7a-decoder';
import type { ResearchGpsBucket } from '../s4-research/contracts';

type WorkerInput = {
  buckets: ResearchGpsBucket[];
  overpassBody: { elements?: unknown[] };
  corridorMarginM: number;
};

try {
  const input = workerData as WorkerInput;
  const ctx = buildM7aRuntimeContext(input);
  const { matches, cpuMs } = runFrozenM7a(ctx);
  parentPort?.postMessage({ ok: true as const, matches, cpuMs });
} catch (error) {
  parentPort?.postMessage({
    ok: false as const,
    error: error instanceof Error ? error.message : String(error),
  });
}
