import { parentPort, workerData } from 'worker_threads';
import { runRoadMatchingPipeline } from '../s4-research';
import type { RoadMatchingPipelineInput } from '../s4-research/contracts';

const input = workerData?.input as RoadMatchingPipelineInput | undefined;
if (!parentPort) {
  process.exit(2);
}
if (!input) {
  parentPort.postMessage({ ok: false, error: 'WORKER_INPUT_MISSING' });
  process.exit(0);
}

try {
  const result = runRoadMatchingPipeline(input);
  parentPort.postMessage({ ok: true, result });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  parentPort.postMessage({ ok: false, error: message });
}
