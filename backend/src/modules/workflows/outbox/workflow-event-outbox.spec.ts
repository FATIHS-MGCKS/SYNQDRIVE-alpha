import { WorkflowEventOutboxStatus, Prisma } from '@prisma/client';
import { WorkflowEventOutboxEnqueueService } from './workflow-event-outbox-enqueue.service';
import { WorkflowIdempotencyService } from '../idempotency/workflow-idempotency.service';
import {
  FIXTURE_OUTBOX_BOOKING_ID,
  FIXTURE_OUTBOX_ORG_ID,
  validBookingConfirmedOutboxInput,
  validBookingReturnedOutboxInput,
  validInvoiceOverdueOutboxInput,
} from './workflow-event-outbox.fixtures';

type OutboxRow = {
  id: string;
  eventId: string;
  organizationId: string;
  eventType: string;
  status: WorkflowEventOutboxStatus;
  idempotencyKey: string;
  envelope: Record<string, unknown>;
  payload: Record<string, unknown>;
  eventVersion: string;
  schemaVersion: string;
  entityType: string | null;
  entityId: string | null;
  correlationId: string;
  causationId: string | null;
  source: string;
  occurredAt: Date;
  receivedAt: Date;
  metadata: Record<string, unknown>;
};

function createOutboxHarness() {
  const outboxRows: OutboxRow[] = [];
  const bookings: Array<{ id: string; organizationId: string; status: string }> = [];
  let outboxSeq = 0;
  let bookingSeq = 0;
  let txFailed = false;

  const tx = {
    booking: {
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { status?: string } }) => {
        if (txFailed) throw new Error('booking update failed');
        const row = bookings.find((b) => b.id === where.id);
        if (!row) throw new Error('booking not found');
        if (data.status) row.status = data.status;
        return { ...row };
      }),
    },
    workflowEventOutbox: {
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if ('eventId' in where) {
          return outboxRows.find((r) => r.eventId === where.eventId) ?? null;
        }
        if ('organizationId_idempotencyKey' in where) {
          const key = where.organizationId_idempotencyKey as {
            organizationId: string;
            idempotencyKey: string;
          };
          return (
            outboxRows.find(
              (r) =>
                r.organizationId === key.organizationId
                && r.idempotencyKey === key.idempotencyKey,
            ) ?? null
          );
        }
        return null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (txFailed) throw new Error('outbox insert failed');
        const dupEvent = outboxRows.find((r) => r.eventId === data.eventId);
        if (dupEvent) {
          const err = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
            code: 'P2002',
            clientVersion: '5',
            meta: { target: ['event_id'] },
          });
          throw err;
        }
        const dupKey = outboxRows.find(
          (r) =>
            r.organizationId === data.organizationId
            && r.idempotencyKey === data.idempotencyKey,
        );
        if (dupKey) {
          const err = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
            code: 'P2002',
            clientVersion: '5',
            meta: { target: ['organization_id', 'idempotency_key'] },
          });
          throw err;
        }
        const row: OutboxRow = {
          id: `outbox-${++outboxSeq}`,
          eventId: data.eventId as string,
          organizationId: data.organizationId as string,
          eventType: data.eventType as string,
          status: (data.status as WorkflowEventOutboxStatus) ?? WorkflowEventOutboxStatus.PENDING,
          idempotencyKey: data.idempotencyKey as string,
          envelope: data.envelope as Record<string, unknown>,
          payload: data.payload as Record<string, unknown>,
          eventVersion: data.eventVersion as string,
          schemaVersion: data.schemaVersion as string,
          entityType: (data.entityType as string | null) ?? null,
          entityId: (data.entityId as string | null) ?? null,
          correlationId: data.correlationId as string,
          causationId: (data.causationId as string | null) ?? null,
          source: data.source as string,
          occurredAt: data.occurredAt as Date,
          receivedAt: data.receivedAt as Date,
          metadata: (data.metadata as Record<string, unknown>) ?? {},
        };
        outboxRows.push(row);
        return row;
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => {
      if (typeof fn === 'function') {
        return fn(tx);
      }
      return Promise.all(fn);
    }),
  };

  const idempotency = {
    isUniqueConstraintError: (err: unknown) =>
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002',
    recordDecision: jest.fn().mockResolvedValue({}),
    explainDuplicateSuppression: jest.fn().mockReturnValue('duplicate'),
  } as unknown as WorkflowIdempotencyService;

  const service = new WorkflowEventOutboxEnqueueService(idempotency);

  return {
    service,
    prisma,
    tx,
    outboxRows,
    bookings,
    bookingSeq,
    addBooking(orgId = FIXTURE_OUTBOX_ORG_ID, status = 'PENDING') {
      const id = `booking-${++bookingSeq}`;
      bookings.push({ id, organizationId: orgId, status });
      return id;
    },
    setTxFailed(failed: boolean) {
      txFailed = failed;
    },
  };
}

describe('WorkflowEventOutboxEnqueueService', () => {
  it('persists business change and event in the same transaction', async () => {
    const h = createOutboxHarness();
    const bookingId = h.addBooking();

    await h.prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED' } });
      const row = await h.service.enqueueInTransaction(tx as unknown as Prisma.TransactionClient, validBookingConfirmedOutboxInput());
      expect(row.eventType).toBe('booking.confirmed');
      expect(row.organizationId).toBe(FIXTURE_OUTBOX_ORG_ID);
    });

    expect(h.bookings[0].status).toBe('CONFIRMED');
    expect(h.outboxRows).toHaveLength(1);
    expect(h.outboxRows[0].status).toBe(WorkflowEventOutboxStatus.PENDING);
    expect(h.outboxRows[0].envelope.eventType).toBe('booking.confirmed');
  });

  it('rolls back outbox when business update fails', async () => {
    const h = createOutboxHarness();
    const bookingId = h.addBooking();
    h.setTxFailed(true);

    await expect(
      h.prisma.$transaction(async (tx) => {
        await tx.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED' } });
        await h.service.enqueueInTransaction(tx as unknown as Prisma.TransactionClient, validBookingConfirmedOutboxInput());
      }),
    ).rejects.toThrow('booking update failed');

    expect(h.bookings[0].status).toBe('PENDING');
    expect(h.outboxRows).toHaveLength(0);
  });

  it('rolls back business change when outbox insert fails', async () => {
    const h = createOutboxHarness();
    const bookingId = h.addBooking();

    await expect(
      h.prisma.$transaction(async (tx) => {
        await tx.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED' } });
        h.setTxFailed(true);
        await h.service.enqueueInTransaction(tx as unknown as Prisma.TransactionClient, validBookingConfirmedOutboxInput());
      }),
    ).rejects.toThrow('outbox insert failed');

    expect(h.outboxRows).toHaveLength(0);
  });

  it('rejects duplicate eventId', async () => {
    const h = createOutboxHarness();
    const fixedEventId = 'evt-dup-0001-0001-0001-0001-000000000001';

    await h.prisma.$transaction(async (tx) => {
      await h.service.enqueueInTransaction(tx as unknown as Prisma.TransactionClient, {
        ...validBookingConfirmedOutboxInput(),
        eventId: fixedEventId,
        idempotencyKey: 'booking.confirmed:first',
      });
    });

    await expect(
      h.prisma.$transaction(async (tx) => {
        await h.service.enqueueInTransaction(tx as unknown as Prisma.TransactionClient, {
          ...validBookingReturnedOutboxInput(),
          eventId: fixedEventId,
          idempotencyKey: 'booking.returned:second',
        });
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_EVENT_ID' });
  });

  it('enforces tenant organizationId on enqueue', async () => {
    const h = createOutboxHarness();

    await expect(
      h.service.enqueueInTransaction(h.tx as unknown as Prisma.TransactionClient, {
        ...validBookingConfirmedOutboxInput(),
        organizationId: '',
      }),
    ).rejects.toMatchObject({ code: 'MISSING_ORGANIZATION_ID' });
  });

  it('rejects invalid payload via registry validation', async () => {
    const h = createOutboxHarness();

    await expect(
      h.service.enqueueInTransaction(h.tx as unknown as Prisma.TransactionClient, {
        ...validBookingConfirmedOutboxInput(),
        payload: { vehicleId: FIXTURE_OUTBOX_BOOKING_ID },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
  });

  it('returns existing row for duplicate idempotency key without second event', async () => {
    const h = createOutboxHarness();
    const input = validBookingConfirmedOutboxInput();

    const first = await h.service.enqueueInTransaction(h.tx as unknown as Prisma.TransactionClient, input);
    const second = await h.service.enqueueInTransaction(h.tx as unknown as Prisma.TransactionClient, input);

    expect(second.id).toBe(first.id);
    expect(h.outboxRows).toHaveLength(1);
  });

  it('supports invoice.overdue and vehicle.health.critical fixtures', async () => {
    const h = createOutboxHarness();

    await h.service.enqueueInTransaction(h.tx as unknown as Prisma.TransactionClient, validInvoiceOverdueOutboxInput());
    await h.service.enqueueInTransaction(h.tx as unknown as Prisma.TransactionClient, {
      organizationId: FIXTURE_OUTBOX_ORG_ID,
      eventType: 'vehicle.health.critical',
      source: 'vehicle-health',
      entityType: 'vehicle',
      entityId: 'vehicle-outbox-fixture-001',
      idempotencyKey: 'vehicle.health.critical:vehicle-outbox-fixture-001:brakes',
      payload: {
        vehicleId: 'vehicle-outbox-fixture-001',
        healthModule: 'brakes',
        severityCode: 'critical',
        metricCode: 'BRAKE_DTC_CRITICAL',
      },
    });

    expect(h.outboxRows.map((r) => r.eventType)).toEqual([
      'invoice.overdue',
      'vehicle.health.critical',
    ]);
  });
});
