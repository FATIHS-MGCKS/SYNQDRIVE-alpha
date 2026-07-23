import { BookingDomainEventOutboxStatus } from '@prisma/client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { BookingDomainEventOutboxRepository } from './booking-domain-event-outbox.repository';
import { BookingDomainEventOutboxProcessorService } from './booking-domain-event-outbox-processor.service';
import { BookingDomainEventConsumerService } from './booking-domain-event-consumer.service';
import { BookingDomainEventOutboxObservabilityService } from './booking-domain-event-outbox-observability.service';
import { BOOKING_DOMAIN_EVENT_TYPES } from './booking-domain-event.types';
import { buildBookingDomainEventIdempotencyKey } from './booking-domain-event-outbox.constants';

describe('BookingDomainEventOutboxRepository', () => {
  function buildRepo() {
    const rows = new Map<string, any>();
    const receipts = new Map<string, any>();
    let idSeq = 0;

    const prisma: any = {
      bookingDomainEventOutbox: {
        findUnique: jest.fn(async ({ where }: any) => {
          if (where.idempotencyKey) return rows.get(where.idempotencyKey) ?? null;
          return [...rows.values()].find((r) => r.id === where.id) ?? null;
        }),
        findFirst: jest.fn(async ({ where, orderBy }: any) => {
          const matches = [...rows.values()].filter((r) => r.aggregateId === where.aggregateId);
          if (orderBy?.aggregateVersion === 'desc') {
            return matches.sort((a, b) => b.aggregateVersion - a.aggregateVersion)[0] ?? null;
          }
          return matches[0] ?? null;
        }),
        create: jest.fn(async ({ data }: any) => {
          const row = { id: `evt-${++idSeq}`, retryCount: 0, ...data };
          rows.set(data.idempotencyKey, row);
          return row;
        }),
        findMany: jest.fn(async ({ where }: any) =>
          [...rows.values()].filter((r) => r.status === where.status),
        ),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const row = [...rows.values()].find((r) => r.id === where.id);
          if (!row) return { count: 0 };
          if (where.status && row.status !== where.status) return { count: 0 };
          Object.assign(row, data);
          if (data.retryCount?.increment) {
            row.retryCount = (row.retryCount ?? 0) + data.retryCount.increment;
          }
          return { count: 1 };
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = [...rows.values()].find((r) => r.id === where.id);
          Object.assign(row, data);
          return row;
        }),
        count: jest.fn(async () => rows.size),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      bookingDomainEventConsumerReceipt: {
        findUnique: jest.fn(async ({ where }: any) => {
          const key = `${where.outboxEventId_consumerId.outboxEventId}:${where.outboxEventId_consumerId.consumerId}`;
          return receipts.get(key) ?? null;
        }),
        upsert: jest.fn(async ({ where, create }: any) => {
          const key = `${where.outboxEventId_consumerId.outboxEventId}:${where.outboxEventId_consumerId.consumerId}`;
          receipts.set(key, create);
          return create;
        }),
      },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));

    return { repo: new BookingDomainEventOutboxRepository(prisma as any), prisma, rows };
  }

  it('persists outbox row in the same transaction as booking mutation (commit path)', async () => {
    const { repo, prisma, rows } = buildRepo();
    let bookingCreated = false;

    await prisma.$transaction(async (tx: any) => {
      bookingCreated = true;
      await repo.enqueueInTransaction(tx, {
        eventType: BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CREATED,
        aggregateId: 'bk-1',
        organizationId: 'org-1',
        payload: { bookingId: 'bk-1', status: 'PENDING' },
        correlationId: 'booking:bk-1',
        idempotencyKey: buildBookingDomainEventIdempotencyKey([
          'org-1',
          BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CREATED,
          'bk-1',
          'created',
        ]),
      });
    });

    expect(bookingCreated).toBe(true);
    expect(rows.size).toBe(1);
    const row = [...rows.values()][0];
    expect(row.aggregateVersion).toBe(1);
    expect(row.status).toBe(BookingDomainEventOutboxStatus.PENDING);
  });

  it('rolls back outbox row when transaction fails', async () => {
    const committedRows = new Map<string, any>();
    let idSeq = 0;
    const txRows = new Map<string, any>();
    const tx: any = {
      bookingDomainEventOutbox: {
        findUnique: jest.fn(async ({ where }: any) =>
          txRows.get(where.idempotencyKey) ?? null,
        ),
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => {
          const row = { id: `evt-${++idSeq}`, retryCount: 0, ...data };
          txRows.set(data.idempotencyKey, row);
          return row;
        }),
      },
    };

    const repo = new BookingDomainEventOutboxRepository({
      bookingDomainEventOutbox: tx.bookingDomainEventOutbox,
    } as any);

    await expect(
      (async () => {
        try {
          await repo.enqueueInTransaction(tx, {
            eventType: BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CANCELLED,
            aggregateId: 'bk-2',
            organizationId: 'org-1',
            payload: { bookingId: 'bk-2', status: 'CANCELLED' },
            correlationId: 'booking:bk-2',
            idempotencyKey: 'dup-test-cancel',
          });
          throw new Error('booking_update_failed');
        } catch (e) {
          txRows.clear();
          throw e;
        }
      })(),
    ).rejects.toThrow('booking_update_failed');

    expect(committedRows.size).toBe(0);
    expect(txRows.size).toBe(0);
  });

  it('deduplicates events by idempotency key', async () => {
    const { repo, prisma } = buildRepo();
    const input = {
      eventType: BOOKING_DOMAIN_EVENT_TYPES.BOOKING_UPDATED,
      aggregateId: 'bk-3',
      organizationId: 'org-1',
      payload: { bookingId: 'bk-3', status: 'CONFIRMED' },
      correlationId: 'booking:bk-3',
      idempotencyKey: 'booking:updated:once',
    };

    const first = await prisma.$transaction((tx: any) => repo.enqueueInTransaction(tx, input));
    const second = await prisma.$transaction((tx: any) => repo.enqueueInTransaction(tx, input));

    expect(second.id).toBe(first.id);
    expect(second.aggregateVersion).toBe(1);
  });

  it('recovers stale PROCESSING rows after worker crash', async () => {
    const prisma = {
      bookingDomainEventOutbox: {
        findMany: jest.fn().mockResolvedValue([{ id: 'evt-stale' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repo = new BookingDomainEventOutboxRepository(prisma as any);
    const recovered = await repo.recoverStaleProcessing(new Date('2026-01-01T00:00:00.000Z'));
    expect(recovered).toEqual(['evt-stale']);
  });

  it('claimForProcessing is exclusive for concurrent workers', async () => {
    const row = {
      id: 'evt-1',
      status: BookingDomainEventOutboxStatus.PENDING,
      retryCount: 0,
    };
    const prisma = {
      bookingDomainEventOutbox: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue({ ...row, status: 'PROCESSING', retryCount: 1 }),
      },
    };
    const repo = new BookingDomainEventOutboxRepository(prisma as any);
    expect(await repo.claimForProcessing('evt-1', 'worker-a')).not.toBeNull();
    expect(await repo.claimForProcessing('evt-1', 'worker-b')).toBeNull();
  });
});

describe('BookingDomainEventOutboxProcessorService', () => {
  const config = { maxAttempts: 5, backoffMs: 2000 };
  const metrics = new TripMetricsService();
  const observability = new BookingDomainEventOutboxObservabilityService(metrics);

  it('reprocesses safely when consumer receipt already exists', async () => {
    const outboxRow = {
      id: 'evt-1',
      eventType: BOOKING_DOMAIN_EVENT_TYPES.PICKUP_COMPLETED,
      aggregateId: 'bk-1',
      organizationId: 'org-1',
      aggregateVersion: 2,
      occurredAt: new Date(),
      payload: { bookingId: 'bk-1', status: 'ACTIVE' },
      correlationId: 'booking:bk-1',
      causationId: 'proto-1',
      idempotencyKey: 'idem-1',
      status: BookingDomainEventOutboxStatus.PENDING,
      retryCount: 0,
    };

    const outboxRepo = {
      claimForProcessing: jest.fn().mockResolvedValue(outboxRow),
      markPublished: jest.fn().mockResolvedValue(outboxRow),
      markRetry: jest.fn(),
      hasConsumerReceipt: jest.fn().mockResolvedValue({ id: 'rcpt-1' }),
      recordConsumerReceipt: jest.fn(),
    };

    const consumer = {
      processPrimaryConsumer: jest.fn().mockResolvedValue(undefined),
      toEnvelope: jest.fn(),
    };

    const processor = new BookingDomainEventOutboxProcessorService(
      config as any,
      outboxRepo as any,
      consumer as any,
      observability,
    );

    const result = await processor.processOutboxId('evt-1', 'worker-1');
    expect(result).toBe('published');
    expect(consumer.processPrimaryConsumer).toHaveBeenCalled();
    expect(outboxRepo.markPublished).toHaveBeenCalledWith('evt-1');
  });
});
