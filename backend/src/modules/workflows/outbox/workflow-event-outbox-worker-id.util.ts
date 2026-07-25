import { hostname } from 'os';
import { randomBytes } from 'crypto';

let cachedWorkerId: string | null = null;

export function resolveWorkflowEventOutboxWorkerId(): string {
  if (cachedWorkerId) return cachedWorkerId;
  const explicit = process.env.WORKFLOW_EVENT_OUTBOX_WORKER_ID?.trim();
  if (explicit) {
    cachedWorkerId = explicit;
    return cachedWorkerId;
  }
  const suffix = randomBytes(4).toString('hex');
  cachedWorkerId = `${hostname()}:${process.pid}:${suffix}`;
  return cachedWorkerId;
}

export function resetWorkflowEventOutboxWorkerIdForTests(): void {
  cachedWorkerId = null;
}
