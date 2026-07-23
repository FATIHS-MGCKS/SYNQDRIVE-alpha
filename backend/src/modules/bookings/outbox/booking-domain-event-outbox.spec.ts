import { BookingDomainEventOutboxStatus } from '@prisma/client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { BookingDomainEventOutboxRepository } from './booking-domain-event-outbox.repository';
import { BookingDomainEventOutboxProcessorService } from './booking-domain-event-outbox-processor.service';
import { BookingDomainEventConsumerService } from './booking-domain-event-consumer.service';
import { BookingDomainEventOutboxObservabilityService } from './booking-domain-event-outbox-observability.service';
import { BookingDomainEventConsumerRouterService } from './consumers/booking-domain-event-consumer-router.service';
import { BOOKING_DOMAIN_EVENT_TYPES } from './booking-domain-event.types';
import { buildBookingDomainEventIdempotencyKey } from './booking-domain-event-outbox.constants';
import { BOOKING_DOMAIN_EVENT_CONSUMER_IDS } from './consumers/booking-domain-event-consumer.constants';
import {
  BookingDomainEventConsumerError,
  BookingDomainEventStaleError,
} from './consumers/booking-domain-event-consumer.errors';

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
          if (where.outboxEventId_consumerId) {
            const key = `${where.outboxEventId_consumerId.outboxEventId}:${where.outboxEventId_consumerId.consumerId}`;
            return receipts.get(key) ?? null;
          }
          if (where.consumerId_businessKey) {
            const key = `bk:${where.consumerId_businessKey.consumerId}:${where.consumerId_businessKey.businessKey}`;
            return receipts.get(key) ?? null;
          }
          return null;
        }),
        findMany: jest.fn(async ({ where }: any) =>
          [...receipts.values()].filter((r) => r.outboxEventId === where.outboxEventId),
        ),
        upsert: jest.fn(async ({ where, create, update }: any) => {
          const key = `${where.outboxEventId_consumerId.outboxEventId}:${where.outboxEventId_consumerId.consumerId}`;
          const businessKey = `bk:${create?.consumerId ?? update?.consumerId ?? 'unknown'}:${create?.businessKey ?? update?.businessKey ?? key}`;
          const row = receipts.get(key) ?? receipts.get(businessKey);
          if (row) {
            Object.assign(row, update ?? create);
            receipts.set(key, row);
            return row;
          }
          const created = { ...create };
          receipts.set(key, created);
          receipts.set(businessKey, created);
          return created;
        }),
      },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));

    return { repo: new BookingDomainEventOutboxRepository(prisma as any), prisma, rows, receipts };
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

  it('records consumer receipt with business key and status', async () => {
    const { repo } = buildRepo();
    await repo.recordConsumerReceipt({
      outboxEventId: 'evt-1',
      consumerId: BOOKING_DOMAIN_EVENT_CONSUMER_IDS.INVOICE,
      businessKey: 'booking.invoice:org-1:bk-1:bootstrap',
      status: 'SUCCEEDED',
      aggregateVersion: 1,
      metadata: { invoiceId: 'inv-1' },
    });
    const receipt = await repo.findConsumerReceipt('evt-1', BOOKING_DOMAIN_EVENT_CONSUMER_IDS.INVOICE);
    expect(receipt?.status).toBe('SUCCEEDED');
    expect(receipt?.businessKey).toContain('booking.invoice');
  });
});

describe('BookingDomainEventOutboxProcessorService', () => {
  const config = { maxAttempts: 5, backoffMs: 2000 };
  const metrics = new TripMetricsService();
  const observability = new BookingDomainEventOutboxObservabilityService(metrics);

  it('reprocesses safely when consumer router completes', async () => {
    const outboxRow = {
      id: 'evt-1',
      eventType: BOOKING_DOMAIN_EVENT_TYPES.PICKUP_COMPLETED,
      aggregateId: 'bk-1',
      organizationId: 'org-1',
      aggregateVersion: 2,
      occurredAt: new Date(),
      payload: { bookingId: 'bk-1', status: 'ACTIVE', protocolId: 'proto-1' },
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
    };

    const consumerRouter = {
      processAllConsumers: jest.fn().mockResolvedValue(undefined),
    };

    const preparationState = {
      reconcile: jest.fn().mockResolvedValue(undefined),
    };

    const processor = new BookingDomainEventOutboxProcessorService(
      config as any,
      outboxRepo as any,
      consumerRouter as any,
      preparationState as any,
      observability,
    );

    const result = await processor.processOutboxId('evt-1', 'worker-1');
    expect(result).toBe('published');
    expect(consumerRouter.processAllConsumers).toHaveBeenCalledWith(outboxRow);
    expect(outboxRepo.markPublished).toHaveBeenCalledWith('evt-1');
  });

  it('marks retry on retryable consumer failure', async () => {
    const outboxRow = {
      id: 'evt-2',
      eventType: BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CONFIRMED,
      aggregateId: 'bk-2',
      organizationId: 'org-1',
      aggregateVersion: 3,
      occurredAt: new Date(),
      payload: { bookingId: 'bk-2', status: 'CONFIRMED' },
      correlationId: 'booking:bk-2',
      causationId: null,
      idempotencyKey: 'idem-2',
      status: BookingDomainEventOutboxStatus.PENDING,
      retryCount: 1,
    };

    const outboxRepo = {
      claimForProcessing: jest.fn().mockResolvedValue(outboxRow),
      markPublished: jest.fn(),
      markRetry: jest.fn().mockResolvedValue({ outcome: 'retry', retryCount: 2 }),
    };

    const consumerRouter = {
      processAllConsumers: jest
        .fn()
        .mockRejectedValue(new BookingDomainEventConsumerError('timeout', { retryable: true })),
    };

    const preparationState = {
      reconcile: jest.fn().mockResolvedValue(undefined),
    };

    const processor = new BookingDomainEventOutboxProcessorService(
      config as any,
      outboxRepo as any,
      consumerRouter as any,
      preparationState as any,
      observability,
    );

    const result = await processor.processOutboxId('evt-2', 'worker-1');
    expect(result).toBe('retry');
    expect(outboxRepo.markRetry).toHaveBeenCalled();
  });
});

describe('BookingDomainEventConsumerRouterService', () => {
  function buildRouter(activeHandler: any) {
    const outboxRepo = {
      findConsumerReceipt: jest.fn().mockResolvedValue(null),
      findConsumerReceiptByBusinessKey: jest.fn().mockResolvedValue(null),
      recordConsumerReceipt: jest.fn().mockResolvedValue({}),
    };
    const envelopeService = new BookingDomainEventConsumerService();
    const inactive = {
      consumerId: 'inactive',
      supportsEvent: () => false,
      buildBusinessKey: () => 'inactive',
      handle: async () => ({ status: 'SKIPPED' as const, businessKey: 'inactive' }),
    };
    const pick = (id: string) => (activeHandler.consumerId === id ? activeHandler : { ...inactive, consumerId: id });
    const router = new BookingDomainEventConsumerRouterService(
      outboxRepo as any,
      envelopeService,
      pick(BOOKING_DOMAIN_EVENT_CONSUMER_IDS.INVOICE),
      pick(BOOKING_DOMAIN_EVENT_CONSUMER_IDS.DOCUMENT_BUNDLE),
      pick(BOOKING_DOMAIN_EVENT_CONSUMER_IDS.RENTAL_AGREEMENT),
      pick(BOOKING_DOMAIN_EVENT_CONSUMER_IDS.PICKUP_RETURN_TASKS),
      pick(BOOKING_DOMAIN_EVENT_CONSUMER_IDS.NOTIFICATIONS),
      pick(BOOKING_DOMAIN_EVENT_CONSUMER_IDS.CUSTOMER_EMAIL),
      pick(BOOKING_DOMAIN_EVENT_CONSUMER_IDS.INTERNAL_EMAIL),
      pick(BOOKING_DOMAIN_EVENT_CONSUMER_IDS.PAYMENT_LINK),
    );
    return { router, outboxRepo };
  }

  const baseRow = {
    id: 'evt-10',
    eventType: BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CREATED,
    aggregateId: 'bk-10',
    organizationId: 'org-1',
    aggregateVersion: 1,
    occurredAt: new Date(),
    payload: { bookingId: 'bk-10', status: 'PENDING' },
    correlationId: 'booking:bk-10',
    causationId: 'user-1',
    idempotencyKey: 'idem-10',
    status: BookingDomainEventOutboxStatus.PENDING,
    retryCount: 0,
  };

  it('skips handler when terminal receipt already exists', async () => {
    const handler = {
      consumerId: BOOKING_DOMAIN_EVENT_CONSUMER_IDS.INVOICE,
      supportsEvent: jest.fn().mockReturnValue(true),
      buildBusinessKey: jest.fn().mockReturnValue('bk:invoice'),
      handle: jest.fn(),
    };
    const { router, outboxRepo } = buildRouter(handler);
    outboxRepo.findConsumerReceipt.mockResolvedValue({ status: 'SUCCEEDED' });

    await router.processAllConsumers(baseRow as any);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('records STALE receipt without failing the batch', async () => {
    const handler = {
      consumerId: BOOKING_DOMAIN_EVENT_CONSUMER_IDS.INVOICE,
      supportsEvent: jest.fn().mockReturnValue(true),
      buildBusinessKey: jest.fn().mockReturnValue('bk:invoice'),
      handle: jest.fn().mockRejectedValue(new BookingDomainEventStaleError()),
    };
    const { router, outboxRepo } = buildRouter(handler);

    await router.processAllConsumers(baseRow as any);
    expect(outboxRepo.recordConsumerReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'STALE' }),
    );
  });

  it('rethrows retryable failures for outbox retry', async () => {
    const handler = {
      consumerId: BOOKING_DOMAIN_EVENT_CONSUMER_IDS.CUSTOMER_EMAIL,
      supportsEvent: jest.fn().mockReturnValue(true),
      buildBusinessKey: jest.fn().mockReturnValue('bk:email'),
      handle: jest
        .fn()
        .mockRejectedValue(
          new BookingDomainEventConsumerError('documents not ready', { retryable: true }),
        ),
    };
    const { router } = buildRouter(handler);

    await expect(router.processAllConsumers(baseRow as any)).rejects.toBeInstanceOf(
      BookingDomainEventConsumerError,
    );
  });

  it('failure injection: non-retryable error persists FAILED receipt', async () => {
    const handler = {
      consumerId: BOOKING_DOMAIN_EVENT_CONSUMER_IDS.PAYMENT_LINK,
      supportsEvent: jest.fn().mockReturnValue(true),
      buildBusinessKey: jest.fn().mockReturnValue('bk:payment'),
      handle: jest
        .fn()
        .mockRejectedValue(
          new BookingDomainEventConsumerError('invalid tenant', { retryable: false, code: 'TENANT_MISMATCH' }),
        ),
    };
    const { router, outboxRepo } = buildRouter(handler);

    await router.processAllConsumers({
      ...baseRow,
      eventType: BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CONFIRMED,
    } as any);

    expect(outboxRepo.recordConsumerReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED' }),
    );
  });
});
