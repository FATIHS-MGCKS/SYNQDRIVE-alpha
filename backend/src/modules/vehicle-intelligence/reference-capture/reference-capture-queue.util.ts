import { randomUUID } from 'crypto';
import {
  isBullMqCompatibleJobId,
  sanitizeBullMqJobId,
} from '@shared/queue/bullmq-job-id.sanitizer';

/** Stable session-scoped runner identity (traceability only — not reused as cycle jobId). */
export function buildReferenceCaptureSessionRunnerKey(sessionId: string): string {
  const jobId = sanitizeBullMqJobId({ namespace: 'refcap-session', key: sessionId });
  if (!isBullMqCompatibleJobId(jobId)) {
    throw new Error(`Invalid reference capture session runner key for session ${sessionId}`);
  }
  return jobId;
}

/** Unique BullMQ job id per physical capture cycle — never reused while a prior job may exist. */
export function buildReferenceCaptureCycleJobId(
  sessionId: string,
  cycleNumber: number,
  cycleUuid: string = randomUUID(),
): string {
  const jobId = sanitizeBullMqJobId({
    namespace: 'refcap-cycle',
    key: `${sessionId}|${cycleNumber}|${cycleUuid}`,
  });
  if (!isBullMqCompatibleJobId(jobId)) {
    throw new Error(`Invalid reference capture cycle job id for session ${sessionId}`);
  }
  return jobId;
}

export function createReferenceCaptureCycleUuid(): string {
  return randomUUID();
}
