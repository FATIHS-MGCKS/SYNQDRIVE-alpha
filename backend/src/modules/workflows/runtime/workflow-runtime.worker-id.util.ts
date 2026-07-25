import { hostname } from 'os';
import { randomBytes } from 'crypto';

let cachedWorkerId: string | null = null;

export function resolveWorkflowRuntimeWorkerId(): string {
  if (cachedWorkerId) return cachedWorkerId;
  const explicit = process.env.WORKFLOW_RUNTIME_WORKER_ID?.trim();
  if (explicit) {
    cachedWorkerId = explicit;
    return cachedWorkerId;
  }
  const suffix = randomBytes(4).toString('hex');
  cachedWorkerId = `wf-runtime:${hostname()}:${process.pid}:${suffix}`;
  return cachedWorkerId;
}

export function resetWorkflowRuntimeWorkerIdForTests(): void {
  cachedWorkerId = null;
}
