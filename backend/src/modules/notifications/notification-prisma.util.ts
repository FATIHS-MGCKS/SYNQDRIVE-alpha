import { Prisma } from '@prisma/client';

export const NOTIFICATION_INGEST_MAX_RETRY_ATTEMPTS = 4;

export function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === 'P2002'
  );
}

/** Optimistic locking — concurrent update on stale version. */
export function isPrismaOptimisticLockFailure(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === 'P2025'
  );
}

export function isPrismaRetryableIngestConflict(error: unknown): boolean {
  return isPrismaUniqueViolation(error) || isPrismaOptimisticLockFailure(error);
}

export async function withUniqueConflictRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = NOTIFICATION_INGEST_MAX_RETRY_ATTEMPTS,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isPrismaRetryableIngestConflict(error) || attempt >= maxAttempts) {
        throw error;
      }
    }
  }
  throw lastError;
}
