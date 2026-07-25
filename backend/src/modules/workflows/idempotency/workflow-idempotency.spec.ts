import { Prisma } from '@prisma/client';
import {
  buildForceReplayOccurrenceId,
  buildWorkflowActionIdempotencyKey,
  buildWorkflowOutboxOccurrenceKey,
  buildWorkflowProviderIdempotencyKey,
  buildWorkflowRunIdempotencyKey,
  parseLegacyRunIdempotencyKey,
  resolveWorkflowOccurrenceId,
} from './index';
import { WorkflowIdempotencyService } from './workflow-idempotency.service';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VEHICLE_ID = 'veh-001';

describe('workflow idempotency keys', () => {
  it('builds action key from org + version + actionStableId + occurrenceId', () => {
    const occurrenceId = 'vehicle.dtc.detected:veh-001:P0420';
    const key = buildWorkflowActionIdempotencyKey({
      organizationId: ORG_A,
      workflowVersionId: VER_ID,
      actionStableId: 'notify-fleet',
      occurrenceId,
    });
    expect(key).toBe(`${ORG_A}:${VER_ID}:notify-fleet:${occurrenceId}`);
    expect(key).not.toMatch(/@/);
  });

  it('provider key matches action key formula', () => {
    const parts = {
      organizationId: ORG_A,
      workflowVersionId: VER_ID,
      actionStableId: 'send-email',
      occurrenceId: 'booking.pickup_overdue:b-1:2026-07-25',
    };
    expect(buildWorkflowProviderIdempotencyKey(parts)).toBe(
      buildWorkflowActionIdempotencyKey(parts),
    );
  });

  it('distinguishes two DTC events on same vehicle', () => {
    const p0420 = resolveWorkflowOccurrenceId({
      eventType: 'vehicle.dtc.detected',
      entityId: VEHICLE_ID,
      payload: { dtcCode: 'P0420', vehicleId: VEHICLE_ID },
    });
    const p0300 = resolveWorkflowOccurrenceId({
      eventType: 'vehicle.dtc.detected',
      entityId: VEHICLE_ID,
      payload: { dtcCode: 'P0300', vehicleId: VEHICLE_ID },
    });
    expect(p0420).not.toBe(p0300);
    expect(p0420).toContain('P0420');
    expect(p0300).toContain('P0300');
  });

  it('distinguishes two pickup-overdue occurrences for different bookings', () => {
    const b1 = resolveWorkflowOccurrenceId({
      eventType: 'booking.pickup_overdue',
      payload: { bookingId: 'booking-a', milestoneDateOnly: '2026-07-25' },
    });
    const b2 = resolveWorkflowOccurrenceId({
      eventType: 'booking.pickup_overdue',
      payload: { bookingId: 'booking-b', milestoneDateOnly: '2026-07-25' },
    });
    expect(b1).not.toBe(b2);
  });

  it('duplicate domain event shares occurrence via explicit occurrenceId', () => {
    const occurrenceId = 'booking.confirmed:booking-99';
    const k1 = buildWorkflowOutboxOccurrenceKey('booking.confirmed', occurrenceId);
    const k2 = buildWorkflowOutboxOccurrenceKey('booking.confirmed', occurrenceId);
    expect(k1).toBe(k2);
  });

  it('cross-tenant run keys do not collide', () => {
    const occurrenceId = 'vehicle.dtc.detected:veh-001:P0420';
    const keyA = buildWorkflowRunIdempotencyKey({
      organizationId: ORG_A,
      workflowVersionId: VER_ID,
      occurrenceId,
    });
    const keyB = buildWorkflowRunIdempotencyKey({
      organizationId: ORG_B,
      workflowVersionId: VER_ID,
      occurrenceId,
    });
    expect(keyA).not.toBe(keyB);
  });

  it('force replay produces a new occurrence suffix', () => {
    const base = 'booking.pickup_overdue:b-1:2026-07-25';
    const forced = buildForceReplayOccurrenceId(base, 'replay-token-1');
    expect(forced).toBe(`${base}:force:replay-token-1`);
    expect(forced).not.toBe(base);
  });

  it('parses legacy run keys', () => {
    expect(
      parseLegacyRunIdempotencyKey(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:workflow:def-1',
      ).kind,
    ).toBe('legacy_event');
    expect(parseLegacyRunIdempotencyKey(`${ORG_A}:${VER_ID}:occ-1`).kind).toBe('canonical');
  });
});

describe('WorkflowIdempotencyService', () => {
  const config = { idempotencyDedupWindowMs: 86_400_000 };
  const prisma = {
    workflowIdempotencyDecision: {
      create: jest.fn().mockResolvedValue({
        id: 'dec-1',
        outcome: 'ACCEPTED',
        reason: 'test',
        scopeKey: 'scope',
        createdAt: new Date(),
      }),
      findFirst: jest.fn(),
    },
  };

  const service = new WorkflowIdempotencyService(config as never, prisma as never);

  it('records explainable duplicate suppression', async () => {
    const reason = service.explainDuplicateSuppression({
      entityType: 'OUTBOX',
      scopeKey: 'booking.confirmed:b-1',
      existingId: 'outbox-1',
    });
    expect(reason).toContain('Duplicate OUTBOX suppressed');
    expect(reason).toContain('outbox-1');
  });

  it('detects unique constraint errors', () => {
    const err = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: '5',
    });
    expect(service.isUniqueConstraintError(err)).toBe(true);
  });

  it('SAME replay keeps occurrenceId', () => {
    expect(service.resolveReplayOccurrenceId('occ-1', 'SAME')).toBe('occ-1');
  });

  it('FORCE_NEW replay appends token', () => {
    const next = service.resolveReplayOccurrenceId('occ-1', 'FORCE_NEW', 'manual-1');
    expect(next).toBe('occ-1:force:manual-1');
  });
});

describe('WorkflowEventOutboxEnqueueService idempotency (atomic)', () => {
  it('returns existing row on parallel duplicate without double insert', async () => {
    const { WorkflowEventOutboxEnqueueService } = await import(
      '../outbox/workflow-event-outbox-enqueue.service'
    );
    const idempotency = {
      isUniqueConstraintError: (err: unknown) =>
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002',
      recordDecision: jest.fn().mockResolvedValue({}),
      explainDuplicateSuppression: jest.fn().mockReturnValue('dup'),
    };
    const enqueue = new WorkflowEventOutboxEnqueueService(idempotency as never);

    const existingRow = {
      id: 'outbox-existing',
      eventId: 'evt-dup',
      organizationId: ORG_A,
      eventType: 'booking.confirmed',
      status: 'PENDING',
      idempotencyKey: 'booking.confirmed:booking-1',
      envelope: {},
      payload: {},
      eventVersion: '1.0.0',
      schemaVersion: '1.0.0',
      entityType: 'booking',
      entityId: 'booking-1',
      correlationId: 'corr',
      causationId: null,
      source: 'bookings',
      occurredAt: new Date(),
      receivedAt: new Date(),
      metadata: {},
    };

    const tx = {
      workflowEventOutbox: {
        create: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('dup', {
            code: 'P2002',
            clientVersion: '5',
            meta: { target: ['organization_id', 'idempotency_key'] },
          }),
        ),
        findUnique: jest.fn().mockResolvedValue(existingRow),
      },
    };

    const result = await enqueue.enqueueInTransaction(tx as never, {
      organizationId: ORG_A,
      eventType: 'booking.confirmed',
      source: 'bookings',
      entityId: 'booking-1',
      payload: { bookingId: 'booking-1' },
    });

    expect(result.id).toBe('outbox-existing');
    expect(idempotency.recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'DUPLICATE_SUPPRESSED' }),
      tx,
    );
  });
});
