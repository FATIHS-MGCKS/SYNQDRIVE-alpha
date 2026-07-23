import { BookingConcurrencyService } from './booking-concurrency.service';
import {
  BookingVersionConflictError,
  BookingVersionRequiredError,
} from './booking-concurrency.errors';

describe('BookingConcurrencyService', () => {
  function buildService(prisma: {
    booking: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
  }) {
    return new BookingConcurrencyService(prisma as never);
  }

  it('requires expectedUpdatedAt', () => {
    const service = buildService({
      booking: { findFirst: jest.fn(), updateMany: jest.fn() },
    });
    expect(() => service.requireExpectedUpdatedAt(undefined)).toThrow(
      BookingVersionRequiredError,
    );
  });

  it('rejects stale version with current server payload', async () => {
    const expected = new Date('2026-07-23T10:00:00.000Z');
    const current = {
      id: 'bk-1',
      updatedAt: new Date('2026-07-23T10:05:00.000Z'),
      status: 'CONFIRMED',
      vehicleId: 'v1',
      customerId: 'c1',
      startDate: new Date('2026-07-24T08:00:00.000Z'),
      endDate: new Date('2026-07-26T18:00:00.000Z'),
      totalPriceCents: 12000,
    };
    const prisma = {
      booking: {
        findFirst: jest.fn().mockResolvedValue(current),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = buildService(prisma);

    await expect(
      service.optimisticUpdate('org-1', 'bk-1', expected, { notes: 'x' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'BOOKING_VERSION_CONFLICT',
        current: expect.objectContaining({
          bookingId: 'bk-1',
          status: 'CONFIRMED',
        }),
      }),
    });
  });

  it('updates only when version matches', async () => {
    const expected = new Date('2026-07-23T10:00:00.000Z');
    const updated = {
      id: 'bk-1',
      organizationId: 'org-1',
      updatedAt: new Date('2026-07-23T10:00:01.000Z'),
      status: 'CONFIRMED',
      vehicleId: 'v1',
      customerId: 'c1',
      startDate: new Date('2026-07-24T08:00:00.000Z'),
      endDate: new Date('2026-07-26T18:00:00.000Z'),
      totalPriceCents: 12000,
    };
    const prisma = {
      booking: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue(updated),
      },
    };
    const service = buildService(prisma);

    const result = await service.optimisticUpdate('org-1', 'bk-1', expected, {
      notes: 'changed',
    });
    expect(result.id).toBe('bk-1');
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'bk-1',
        organizationId: 'org-1',
        updatedAt: expected,
      },
      data: { notes: 'changed' },
    });
  });

  it('simulates concurrent editors — second write loses', async () => {
    const versionA = new Date('2026-07-23T10:00:00.000Z');
    const versionB = new Date('2026-07-23T10:00:00.000Z');
    let storedUpdatedAt = versionA;

    const prisma = {
      booking: {
        updateMany: jest.fn(async ({ where }) => {
          if (where.updatedAt.getTime() === storedUpdatedAt.getTime()) {
            storedUpdatedAt = new Date(storedUpdatedAt.getTime() + 1000);
            return { count: 1 };
          }
          return { count: 0 };
        }),
        findFirst: jest.fn(async () => ({
          id: 'bk-1',
          updatedAt: storedUpdatedAt,
          status: 'CONFIRMED',
          vehicleId: 'v1',
          customerId: 'c1',
          startDate: new Date(),
          endDate: new Date(),
          totalPriceCents: 100,
        })),
      },
    };
    const service = buildService(prisma);

    await service.optimisticUpdate('org-1', 'bk-1', versionA, { notes: 'first' });
    await expect(
      service.optimisticUpdate('org-1', 'bk-1', versionB, { notes: 'second' }),
    ).rejects.toBeInstanceOf(BookingVersionConflictError);
  });

  it('simulates cancel + edit race — cancel wins, edit gets conflict', async () => {
    const version = new Date('2026-07-23T10:00:00.000Z');
    let storedUpdatedAt = version;
    let storedStatus = 'CONFIRMED';

    const prisma = {
      booking: {
        updateMany: jest.fn(async ({ where, data }) => {
          if (where.updatedAt.getTime() === storedUpdatedAt.getTime()) {
            storedUpdatedAt = new Date(storedUpdatedAt.getTime() + 1000);
            if (data.status === 'CANCELLED') storedStatus = 'CANCELLED';
            if (data.notes) storedStatus = storedStatus;
            return { count: 1 };
          }
          return { count: 0 };
        }),
        findFirst: jest.fn(async () => ({
          id: 'bk-1',
          updatedAt: storedUpdatedAt,
          status: storedStatus,
          vehicleId: 'v1',
          customerId: 'c1',
          startDate: new Date(),
          endDate: new Date(),
          totalPriceCents: 100,
        })),
      },
    };
    const service = buildService(prisma);

    await service.optimisticUpdate('org-1', 'bk-1', version, {
      status: 'CANCELLED',
    });
    await expect(
      service.optimisticUpdate('org-1', 'bk-1', version, { notes: 'edit attempt' }),
    ).rejects.toBeInstanceOf(BookingVersionConflictError);
  });

  it('rejects retry with stale version after pickup changed booking', async () => {
    const stale = new Date('2026-07-23T10:00:00.000Z');
    const current = new Date('2026-07-23T10:02:00.000Z');
    const prisma = {
      booking: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'bk-1',
          updatedAt: current,
          status: 'ACTIVE',
          vehicleId: 'v2',
          customerId: 'c1',
          startDate: new Date(),
          endDate: new Date(),
          totalPriceCents: 100,
        }),
      },
    };
    const service = buildService(prisma);

    await expect(
      service.optimisticUpdate('org-1', 'bk-1', stale, {
        notes: 'vehicle change attempt',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'BOOKING_VERSION_CONFLICT',
        current: expect.objectContaining({ status: 'ACTIVE', vehicleId: 'v2' }),
      }),
    });
  });
});
