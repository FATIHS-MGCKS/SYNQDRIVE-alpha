import { BookingIdempotencyStatus, Prisma } from '@prisma/client';
import { BookingIdempotencyService } from './booking-idempotency.service';
import { BookingIdempotencyConfigService } from './booking-idempotency.config';
import {
  BookingIdempotencyInProgressError,
  BookingIdempotencyKeyReusedError,
  BookingIdempotencyKeyRequiredError,
} from './booking-idempotency.errors';
import { hashBookingIdempotencyRequest } from './booking-idempotency.util';

describe('BookingIdempotencyService', () => {
  const config = new BookingIdempotencyConfigService();

  function buildService(prisma: {
    $transaction: jest.Mock;
    bookingIdempotencyRecord: {
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
  }) {
    return new BookingIdempotencyService(prisma as never, config);
  }

  it('requires idempotency key', () => {
    const service = buildService({
      $transaction: jest.fn(),
      bookingIdempotencyRecord: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    });
    expect(() => service.requireKey('', 'BOOKING_CREATE')).toThrow(BookingIdempotencyKeyRequiredError);
  });

  it('replays identical request with same key', async () => {
    const fingerprintPayload = { vehicleId: 'v1' };
    const requestFingerprint = hashBookingIdempotencyRequest(fingerprintPayload);
    const existing = {
      id: 'rec-1',
      requestFingerprint,
      status: BookingIdempotencyStatus.COMPLETED,
      resultPayload: { bookingId: 'bk-1' },
    };

    const tx = {
      $executeRaw: jest.fn(),
      bookingIdempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
      bookingIdempotencyRecord: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const service = buildService(prisma);
    const handler = jest.fn();

    const result = await service.execute({
      organizationId: 'org-1',
      actorUserId: 'user-1',
      operation: 'BOOKING_CREATE',
      idempotencyKey: 'key-1',
      fingerprintPayload,
      handler,
    });

    expect(result.replayed).toBe(true);
    expect(result.result).toEqual({ bookingId: 'bk-1' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects same key with different fingerprint', async () => {
    const existing = {
      id: 'rec-1',
      requestFingerprint: 'fp-a',
      status: BookingIdempotencyStatus.COMPLETED,
      resultPayload: { bookingId: 'bk-1' },
    };

    const tx = {
      $executeRaw: jest.fn(),
      bookingIdempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
      bookingIdempotencyRecord: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const service = buildService(prisma);

    await expect(
      service.execute({
        organizationId: 'org-1',
        actorUserId: 'user-1',
        operation: 'BOOKING_CREATE',
        idempotencyKey: 'key-1',
        fingerprintPayload: { vehicleId: 'v2' },
        handler: async () => ({ result: { bookingId: 'bk-2' } }),
      }),
    ).rejects.toBeInstanceOf(BookingIdempotencyKeyReusedError);
  });

  it('creates record and runs handler once', async () => {
    const tx = {
      $executeRaw: jest.fn(),
      bookingIdempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'rec-new' }),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
      bookingIdempotencyRecord: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const service = buildService(prisma);
    const handler = jest.fn().mockResolvedValue({
      result: { bookingId: 'bk-new' },
      resultReference: 'bk-new',
    });

    const result = await service.execute({
      organizationId: 'org-1',
      actorUserId: 'user-1',
      operation: 'BOOKING_CREATE',
      idempotencyKey: 'key-new',
      fingerprintPayload: { vehicleId: 'v1' },
      handler,
    });

    expect(result.replayed).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(prisma.bookingIdempotencyRecord.updateMany).toHaveBeenCalled();
  });

  it('purges expired records', async () => {
    const prisma = {
      $transaction: jest.fn(),
      bookingIdempotencyRecord: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ id: 'old-1' }, { id: 'old-2' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };

    const service = buildService(prisma);
    await expect(service.purgeExpired()).resolves.toBe(2);
  });

  it('simulates client timeout retry — handler runs once, second call replays', async () => {
    const handler = jest.fn().mockResolvedValue({
      result: { bookingId: 'bk-retry' },
      resultReference: 'bk-retry',
    });

    let storedRecord: {
      id: string;
      requestFingerprint: string;
      status: BookingIdempotencyStatus;
      resultPayload: unknown;
    } | null = null;

    const tx = {
      $executeRaw: jest.fn(),
      bookingIdempotencyRecord: {
        findUnique: jest.fn().mockImplementation(async () => storedRecord),
        create: jest.fn().mockImplementation(async (args: { data: { requestFingerprint: string } }) => {
          storedRecord = {
            id: 'rec-retry',
            requestFingerprint: args.data.requestFingerprint,
            status: BookingIdempotencyStatus.PROCESSING,
            resultPayload: null,
          };
          return { id: 'rec-retry' };
        }),
        update: jest.fn(),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
      bookingIdempotencyRecord: {
        findUnique: jest.fn().mockImplementation(async () => storedRecord),
        create: jest.fn(),
        updateMany: jest.fn().mockImplementation(async () => {
          if (storedRecord) {
            storedRecord = {
              ...storedRecord,
              status: BookingIdempotencyStatus.COMPLETED,
              resultPayload: { bookingId: 'bk-retry' },
            };
          }
          return { count: 1 };
        }),
      },
    };

    const service = buildService(prisma);
    const input = {
      organizationId: 'org-1',
      actorUserId: 'user-1',
      operation: 'BOOKING_CREATE' as const,
      idempotencyKey: 'retry-key',
      fingerprintPayload: { vehicleId: 'v1' },
      handler,
    };

    const first = await service.execute(input);
    expect(first.replayed).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);

    const second = await service.execute(input);
    expect(second.replayed).toBe(true);
    expect(second.result).toEqual({ bookingId: 'bk-retry' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('throws IDEMPOTENCY_IN_PROGRESS when parallel request cannot poll completion', async () => {
    const fingerprint = hashBookingIdempotencyRequest({ vehicleId: 'v1' });
    const processing = {
      id: 'rec-processing',
      requestFingerprint: fingerprint,
      status: BookingIdempotencyStatus.PROCESSING,
      resultPayload: null,
    };

    const tx = {
      $executeRaw: jest.fn(),
      bookingIdempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(processing),
        create: jest.fn(),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
      bookingIdempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(processing),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const service = buildService(prisma);

    await expect(
      service.execute({
        organizationId: 'org-1',
        actorUserId: 'user-1',
        operation: 'BOOKING_CREATE',
        idempotencyKey: 'parallel-key',
        fingerprintPayload: { vehicleId: 'v1' },
        handler: async () => ({ result: { bookingId: 'bk-parallel' } }),
      }),
    ).rejects.toBeInstanceOf(BookingIdempotencyInProgressError);
  });

  it('resumes FAILED record and re-runs handler on identical retry', async () => {
    const fingerprintPayload = { vehicleId: 'v1' };
    const fingerprint = hashBookingIdempotencyRequest(fingerprintPayload);
    const failed = {
      id: 'rec-failed',
      requestFingerprint: fingerprint,
      status: BookingIdempotencyStatus.FAILED,
      resultPayload: null,
    };

    const tx = {
      $executeRaw: jest.fn(),
      bookingIdempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(failed),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'rec-failed' }),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
      bookingIdempotencyRecord: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const handler = jest.fn().mockResolvedValue({
      result: { bookingId: 'bk-after-fail' },
      resultReference: 'bk-after-fail',
    });

    const service = buildService(prisma);
    const result = await service.execute({
      organizationId: 'org-1',
      actorUserId: 'user-1',
      operation: 'BOOKING_CREATE',
      idempotencyKey: 'failed-key',
      fingerprintPayload,
      handler,
    });

    expect(result.replayed).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(tx.bookingIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rec-failed' },
        data: expect.objectContaining({ status: BookingIdempotencyStatus.PROCESSING }),
      }),
    );
  });
});
