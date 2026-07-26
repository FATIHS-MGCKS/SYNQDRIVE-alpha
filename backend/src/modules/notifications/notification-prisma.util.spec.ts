import { Prisma } from '@prisma/client';
import {
  isPrismaOptimisticLockFailure,
  isPrismaRetryableIngestConflict,
  isPrismaUniqueViolation,
  NOTIFICATION_INGEST_MAX_RETRY_ATTEMPTS,
  withUniqueConflictRetry,
} from './notification-prisma.util';

describe('notification-prisma.util', () => {
  it('detects prisma unique violations', () => {
    const err = new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: 't' });
    expect(isPrismaUniqueViolation(err)).toBe(true);
    expect(isPrismaUniqueViolation(new Error('other'))).toBe(false);
  });

  it('detects optimistic lock failures', () => {
    const err = new Prisma.PrismaClientKnownRequestError('stale', { code: 'P2025', clientVersion: 't' });
    expect(isPrismaOptimisticLockFailure(err)).toBe(true);
    expect(isPrismaRetryableIngestConflict(err)).toBe(true);
  });

  it('retries on unique conflict', async () => {
    let attempts = 0;
    const result = await withUniqueConflictRetry(async () => {
      attempts++;
      if (attempts < 2) {
        throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 't' });
      }
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('retries on optimistic lock failure', async () => {
    let attempts = 0;
    const result = await withUniqueConflictRetry(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Prisma.PrismaClientKnownRequestError('stale', { code: 'P2025', clientVersion: 't' });
      }
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('stops after max attempts', async () => {
    await expect(
      withUniqueConflictRetry(async () => {
        throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 't' });
      }, 2),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(NOTIFICATION_INGEST_MAX_RETRY_ATTEMPTS).toBe(4);
  });
});
