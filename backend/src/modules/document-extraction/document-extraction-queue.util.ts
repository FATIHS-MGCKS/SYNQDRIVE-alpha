import { JobsOptions } from 'bullmq';
import { Queue } from 'bullmq';
import { ConfigType } from '@nestjs/config';
import documentExtractionConfig from '@config/document-extraction.config';

export const DOCUMENT_EXTRACTION_JOB_NAME = 'extract';

export function buildExtractionJobId(extractionId: string): string {
  return `extract-${extractionId}`;
}

export function buildExtractionJobOptions(
  config: ConfigType<typeof documentExtractionConfig>,
  extractionId: string,
): JobsOptions {
  return {
    jobId: buildExtractionJobId(extractionId),
    attempts: config.jobAttempts,
    backoff: {
      type: 'exponential',
      delay: config.jobBackoffMs,
    },
    removeOnComplete: true,
    removeOnFail: { count: 100, age: 7 * 24 * 3600 },
  };
}

/** Removes terminal BullMQ jobs so the same jobId can be re-enqueued safely. */
export async function removeTerminalExtractionJob(
  queue: Queue,
  extractionId: string,
): Promise<'removed' | 'active' | 'missing'> {
  const jobId = buildExtractionJobId(extractionId);
  const existing = await queue.getJob(jobId);
  if (!existing) return 'missing';

  const state = await existing.getState();
  if (state === 'active' || state === 'waiting' || state === 'delayed') {
    return 'active';
  }
  if (state === 'failed' || state === 'completed') {
    await existing.remove();
    return 'removed';
  }
  return 'missing';
}

export function isProductionEnvironment(): boolean {
  return (process.env.NODE_ENV || 'development') === 'production';
}

export function computeNextRetryAt(backoffMs: number, attemptNumber: number): Date {
  const delayMs = backoffMs * Math.pow(2, Math.max(0, attemptNumber - 1));
  return new Date(Date.now() + delayMs);
}
