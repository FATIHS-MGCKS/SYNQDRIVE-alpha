import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DOCUMENT_EXTRACTION_ERROR_CODES } from './document-extraction-lifecycle.util';

const RECOVERY_META_KEY = '_queueRecoveryCount';

export function readQueueRecoveryCount(plausibility: unknown): number {
  if (!plausibility || typeof plausibility !== 'object' || Array.isArray(plausibility)) {
    return 0;
  }
  const value = (plausibility as Record<string, unknown>)[RECOVERY_META_KEY];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function withIncrementedRecoveryCount(
  plausibility: unknown,
): Prisma.InputJsonValue {
  const base =
    plausibility && typeof plausibility === 'object' && !Array.isArray(plausibility)
      ? { ...(plausibility as Record<string, unknown>) }
      : {};
  const next = readQueueRecoveryCount(plausibility) + 1;
  return { ...base, [RECOVERY_META_KEY]: next } as Prisma.InputJsonValue;
}

export function logRecoveryAction(
  logger: Logger,
  action: string,
  extractionId: string,
  details?: Record<string, unknown>,
): void {
  logger.warn(
    `[DocExtractRecovery] ${action} extractionId=${extractionId}${
      details ? ` ${JSON.stringify(details)}` : ''
    }`,
  );
}

export const QUEUE_ENQUEUE_FAILURE = {
  errorPhase: 'QUEUE' as const,
  errorCode: DOCUMENT_EXTRACTION_ERROR_CODES.QUEUE_UNAVAILABLE,
  safeMessage: 'Queue derzeit nicht verfügbar — erneut versuchen',
};

export const WORKERS_DISABLED_FAILURE = {
  errorPhase: 'QUEUE' as const,
  errorCode: DOCUMENT_EXTRACTION_ERROR_CODES.QUEUE_UNAVAILABLE,
  safeMessage: 'Document processing queue is not available',
};
