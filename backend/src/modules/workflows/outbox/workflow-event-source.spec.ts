/**
 * Phase 4 Prompt 18 — domain event source wiring regressions.
 * Validates transactional outbox emission from priority Fachmodule producers.
 */
import { WorkflowEventOutboxStatus } from '@prisma/client';
import { WorkflowEventOutboxEmitterService } from './workflow-event-outbox-emitter.service';
import { WorkflowEventOutboxEnqueueService } from './workflow-event-outbox-enqueue.service';
import { buildVehicleFindingOccurrenceId } from './workflow-event-occurrence.util';
import { validateAndNormalizeWorkflowEvent } from '../registry';
import {
  FIXTURE_OUTBOX_ORG_ID,
  validBookingConfirmedOutboxInput,
} from './workflow-event-outbox.fixtures';

function createEmitterHarness() {
  const outboxRows: Array<{
    id: string;
    organizationId: string;
    eventType: string;
    idempotencyKey: string;
    status: WorkflowEventOutboxStatus;
    payload: Record<string, unknown>;
  }> = [];
  let seq = 0;

  const tx = {
    workflowEventOutbox: {
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
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
        const row = {
          id: `outbox-${++seq}`,
          organizationId: data.organizationId as string,
          eventType: data.eventType as string,
          idempotencyKey: data.idempotencyKey as string,
          status: (data.status as WorkflowEventOutboxStatus) ?? WorkflowEventOutboxStatus.PENDING,
          payload: data.payload as Record<string, unknown>,
        };
        outboxRows.push(row);
        return row;
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const config = {
    enabled: true,
    emitBookingLifecycle: true,
    emitBookingTiming: true,
    emitVehicleHealth: true,
    emitVehicleDtc: true,
    emitVehicleTelemetry: true,
    emitBilling: true,
    emitCustomer: true,
    emitDamage: true,
    emitService: true,
    emitTask: true,
  };

  const enqueue = new WorkflowEventOutboxEnqueueService();
  const emitter = new WorkflowEventOutboxEmitterService(
    config as never,
    enqueue,
    prisma as never,
  );

  return { emitter, outboxRows, tx, config, prisma };
}

describe('Workflow domain event sources (Phase 4 Prompt 18)', () => {
  describe('booking lifecycle — atomic + idempotent', () => {
    it('creates exactly one booking.confirmed outbox row per idempotency key', async () => {
      const h = createEmitterHarness();
      const input = {
        ...validBookingConfirmedOutboxInput(),
        group: 'bookingLifecycle' as const,
        idempotencyKey: 'booking.confirmed:booking-1',
      };

      await h.prisma.$transaction(async (tx) => {
        await h.emitter.enqueueInTransaction(tx as never, input);
        await h.emitter.enqueueInTransaction(tx as never, input);
      });

      expect(h.outboxRows).toHaveLength(1);
      expect(h.outboxRows[0].organizationId).toBe(FIXTURE_OUTBOX_ORG_ID);
      expect(h.outboxRows[0].eventType).toBe('booking.confirmed');
    });

    it('rejects registry-invalid booking.confirmed payload (PII)', () => {
      expect(() =>
        validateAndNormalizeWorkflowEvent({
          organizationId: FIXTURE_OUTBOX_ORG_ID,
          type: 'booking.confirmed',
          payload: {
            bookingId: '550e8400-e29b-41d4-a716-446655440000',
            vehicleId: '550e8400-e29b-41d4-a716-446655440001',
            email: 'user@example.com',
          },
        }),
      ).toThrow();
    });
  });

  describe('vehicle telemetry — stable occurrenceId dedupe', () => {
    it('uses stable occurrenceId for repeated soft-offline signals', async () => {
      const h = createEmitterHarness();
      const occurrenceId = buildVehicleFindingOccurrenceId(
        'vehicle.telemetry.soft_offline',
        'veh-1',
        'signal_delayed',
      );

      const base = {
        group: 'vehicleTelemetry' as const,
        organizationId: FIXTURE_OUTBOX_ORG_ID,
        eventType: 'vehicle.telemetry.soft_offline' as const,
        source: 'telemetry',
        entityType: 'vehicle' as const,
        entityId: 'veh-1',
        occurrenceId,
        payload: {
          vehicleId: 'veh-1',
          lastSignalAt: '2026-07-24T10:00:00.000Z',
          minutesSinceSignal: 45,
          source: 'dimo' as const,
        },
      };

      await h.emitter.enqueueStandalone(base);
      await h.emitter.enqueueStandalone(base);

      expect(h.outboxRows).toHaveLength(1);
      expect(h.outboxRows[0].idempotencyKey).toContain(occurrenceId);
    });

    it('validates telemetry offline payload against registry', () => {
      const normalized = validateAndNormalizeWorkflowEvent({
        organizationId: FIXTURE_OUTBOX_ORG_ID,
        type: 'vehicle.telemetry.offline',
        payload: {
          vehicleId: '550e8400-e29b-41d4-a716-446655440000',
          lastSignalAt: '2026-07-24T08:00:00.000Z',
          minutesSinceSignal: 120,
          source: 'dimo',
        },
      });
      expect(normalized.type).toBe('vehicle.telemetry.offline');
    });
  });

  describe('customer verification failed — tenant scoping', () => {
    it('scopes outbox row to producer organizationId', async () => {
      const h = createEmitterHarness();
      const orgA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const orgB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

      await h.emitter.enqueueStandalone({
        group: 'customer',
        organizationId: orgA,
        eventType: 'customer.verification.failed',
        source: 'customers',
        entityType: 'customer',
        entityId: 'cust-1',
        idempotencyKey: 'customer.verification.failed:check-1',
        payload: {
          customerId: 'cust-1',
          verificationType: 'identity',
          reasonCode: 'DECLINED',
          providerRef: 'session-1',
        },
      });

      await h.emitter.enqueueStandalone({
        group: 'customer',
        organizationId: orgB,
        eventType: 'customer.verification.failed',
        source: 'customers',
        entityType: 'customer',
        entityId: 'cust-1',
        idempotencyKey: 'customer.verification.failed:check-1',
        payload: {
          customerId: 'cust-1',
          verificationType: 'identity',
          reasonCode: 'DECLINED',
          providerRef: 'session-1',
        },
      });

      expect(h.outboxRows).toHaveLength(2);
      expect(new Set(h.outboxRows.map((r) => r.organizationId))).toEqual(
        new Set([orgA, orgB]),
      );
    });
  });

  describe('feature flags — controlled rollout', () => {
    it('skips emission when group flag is disabled', async () => {
      const h = createEmitterHarness();
      h.config.emitBilling = false;

      const result = await h.emitter.enqueueStandalone({
        group: 'billing',
        organizationId: FIXTURE_OUTBOX_ORG_ID,
        eventType: 'invoice.overdue',
        source: 'billing',
        entityType: 'invoice',
        entityId: 'inv-1',
        payload: {
          invoiceId: '550e8400-e29b-41d4-a716-446655440001',
          dueAt: '2026-07-01T00:00:00.000Z',
        },
      });

      expect(result).toBeNull();
      expect(h.outboxRows).toHaveLength(0);
    });
  });
});
