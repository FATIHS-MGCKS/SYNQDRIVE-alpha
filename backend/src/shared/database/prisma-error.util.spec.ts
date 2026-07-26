import { Prisma } from '@prisma/client';
import { isPrismaUniqueViolation } from './prisma-error.util';

describe('isPrismaUniqueViolation', () => {
  it('returns true for P2002 without field filter', () => {
    const error = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['vin', 'organization_id'] },
    });
    expect(isPrismaUniqueViolation(error)).toBe(true);
  });

  it('returns true when all target fields match', () => {
    const error = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['vin', 'organization_id'] },
    });
    expect(isPrismaUniqueViolation(error, ['vin', 'organizationId'])).toBe(true);
  });

  it('returns false for non-unique errors', () => {
    const error = new Prisma.PrismaClientKnownRequestError('not found', {
      code: 'P2025',
      clientVersion: 'test',
    });
    expect(isPrismaUniqueViolation(error)).toBe(false);
  });
});
