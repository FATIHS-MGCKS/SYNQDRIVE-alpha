import { Prisma } from '@prisma/client';
import { createOrFindByUnique, isPrismaUniqueViolation } from './battery-v2-idempotent-write.util';

describe('battery-v2-idempotent-write.util', () => {
  it('detects Prisma P2002 unique violations', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
    });
    expect(isPrismaUniqueViolation(err)).toBe(true);
    expect(isPrismaUniqueViolation(new Error('other'))).toBe(false);
  });

  it('returns created record on first write', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'rec-1' });
    const findExisting = jest.fn();

    const result = await createOrFindByUnique({ create, findExisting });

    expect(result).toEqual({ record: { id: 'rec-1' }, created: true });
    expect(findExisting).not.toHaveBeenCalled();
  });

  it('returns existing record on parallel unique violation', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const create = jest.fn().mockRejectedValue(p2002);
    const findExisting = jest.fn().mockResolvedValue({ id: 'rec-existing' });

    const result = await createOrFindByUnique({ create, findExisting });

    expect(result).toEqual({ record: { id: 'rec-existing' }, created: false });
  });

  it('rethrows when unique violation but no existing row found', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const create = jest.fn().mockRejectedValue(p2002);
    const findExisting = jest.fn().mockResolvedValue(null);

    await expect(createOrFindByUnique({ create, findExisting })).rejects.toBe(p2002);
  });

  it('rethrows non-unique errors', async () => {
    const err = new Error('db down');
    const create = jest.fn().mockRejectedValue(err);
    const findExisting = jest.fn();

    await expect(createOrFindByUnique({ create, findExisting })).rejects.toBe(err);
  });
});
