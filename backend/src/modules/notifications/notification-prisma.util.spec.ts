import { Prisma } from '@prisma/client';
import { isPrismaUniqueViolation, withUniqueConflictRetry } from './notification-prisma.util';

describe('notification-prisma.util', () => {
  it('detects prisma unique violations', () => {
    const err = new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: 't' });
    expect(isPrismaUniqueViolation(err)).toBe(true);
    expect(isPrismaUniqueViolation(new Error('other'))).toBe(false);
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
});
