/**
 * Adversarial regression: PENDING_EVALUATION must reschedule via reconciliation,
 * then terminate as COMPLETED or MISSED — never stuck indefinitely.
 */
import {
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
  TripStatus,
} from '@prisma/client';
import { BatteryRestTargetEvaluateHandler } from './handlers/battery-rest-target-evaluate.handler';
import { BatteryV2ReconciliationService } from './battery-v2-reconciliation.service';
import { LvRestWindowState } from '../battery-v2-domain';
import {
  LV_REST_TARGET_JOB_STATUS,
  LV_REST_TARGET_TYPES,
} from '../lv-rest-window/lv-rest-window-target.metadata';
import { BatteryMeasurementSessionRepository } from '../battery-measurement-session.repository';

jest.mock('@config/battery-health-v2.config', () => {
  const actual = jest.requireActual('@config/battery-health-v2.config');
  return {
    ...actual,
    isBatteryV2RestShadowEnabled: jest.fn().mockReturnValue(true),
    getBatteryRestTargetRetryGraceMs: jest.fn().mockReturnValue(30 * 60_000),
    getBatteryRest60mDelayMs: jest.fn().mockReturnValue(60 * 60_000),
    getBatteryRest6hDelayMs: jest.fn().mockReturnValue(6 * 60 * 60_000),
  };
});

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';
const SESSION = 'clsess123456789012345678901';
const TRIP_N = 'cltrip1234567890123456789012';
const TRIP_PREV = 'cltrip0987654321098765432109';

function buildHandlerAndReconciliation() {
  let sessionMetadata: Record<string, unknown> = {
    lvRestWindowState: LvRestWindowState.RESTING,
    scheduledTargets: {
      REST_60M: {
        idempotencyKey: `battery-rest:${VEH}:lv-rest:${VEH}:anchor:60m`,
        scheduledFor: '2026-08-30T12:00:00.000Z',
        status: LV_REST_TARGET_JOB_STATUS.ENQUEUED,
      },
    },
  };

  let updatedAt = new Date('2026-08-30T11:00:00.000Z');
  const sessionRow = {
    id: SESSION,
    organizationId: ORG,
    vehicleId: VEH,
    startedAt: new Date('2026-08-30T11:00:00.000Z'),
    idempotencyKey: `lv-rest:${VEH}:anchor`,
    metadata: sessionMetadata,
    status: BatteryMeasurementSessionStatus.ACTIVE,
    type: BatteryMeasurementSessionType.LV_REST_WINDOW,
    updatedAt,
  };

  const prisma = {
    batteryMeasurementSession: {
      findFirst: jest.fn(async () => ({
        ...sessionRow,
        metadata: sessionMetadata,
        updatedAt,
      })),
      findMany: jest.fn(async () => [{ ...sessionRow, metadata: sessionMetadata, updatedAt }]),
      update: jest.fn(async ({ data }: any) => {
        sessionMetadata = data.metadata as Record<string, unknown>;
        return { ...sessionRow, metadata: sessionMetadata };
      }),
      updateMany: jest.fn(async ({ data, where }: any) => {
        if (where?.updatedAt?.getTime() !== updatedAt.getTime()) {
          return { count: 0 };
        }
        sessionMetadata = data.metadata as Record<string, unknown>;
        updatedAt = new Date(updatedAt.getTime() + 1);
        return { count: 1 };
      }),
    },
    batteryMeasurement: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    vehicleLatestState: { findMany: jest.fn().mockResolvedValue([]) },
    batteryFeatures: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleTrip: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    vehicleTripDetectionState: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleEnergyEvent: { findMany: jest.fn().mockResolvedValue([]) },
    hvChargeSession: { findUnique: jest.fn() },
    batteryAssessment: { findFirst: jest.fn() },
    hvBatteryHealthSnapshot: { findFirst: jest.fn() },
    batteryHealthSnapshot: { findFirst: jest.fn() },
  };

  const evaluation = {
    evaluateAndPersist: jest.fn(),
  };

  const handler = new BatteryRestTargetEvaluateHandler(
    prisma as any,
    evaluation as any,
    { recordLvRestShadowMeasurement: jest.fn() } as any,
    { ensureAssessmentHandoff: jest.fn().mockResolvedValue({ enqueued: false, skipped: true }) } as any,
  );

  const restTargetProducer = {
    scheduleRest60m: jest.fn().mockResolvedValue({
      scheduled: true,
      skipped: false,
      idempotencyKey: `battery-rest:${VEH}:lv-rest:${VEH}:anchor:60m`,
      scheduledFor: new Date('2026-08-30T12:00:00.000Z'),
      delayMs: 0,
      bullJobId: 'job-retry',
    }),
    scheduleRest6h: jest.fn().mockResolvedValue({
      scheduled: true,
      skipped: false,
      idempotencyKey: `battery-rest:${VEH}:lv-rest:${VEH}:anchor:6h`,
      scheduledFor: new Date('2026-08-30T17:00:00.000Z'),
      delayMs: 0,
      bullJobId: 'job-6h-retry',
    }),
    buildScheduledTargetMetadata: jest.fn((_result: unknown, type: string) => ({
      idempotencyKey: `battery-rest:${VEH}:lv-rest:${VEH}:anchor:${type === 'REST_6H' ? '6h' : '60m'}`,
      scheduledFor: new Date().toISOString(),
      status: LV_REST_TARGET_JOB_STATUS.ENQUEUED,
      bullJobId: 'job-retry',
    })),
    getRest60mDelayMs: jest.fn().mockReturnValue(3600000),
    getRest6hDelayMs: jest.fn().mockReturnValue(21600000),
  };

  const reconciliation = new BatteryV2ReconciliationService(
    prisma as any,
    { enqueue: jest.fn(), hasLiveJob: jest.fn().mockResolvedValue(false) } as any,
    { classifyAndEnqueue: jest.fn() } as any,
    {
      isDeadLetter: jest.fn().mockResolvedValue(false),
      clearDeadLetter: jest.fn().mockResolvedValue(true),
    } as any,
    {
      reconcilePeriodicRefresh: jest.fn().mockResolvedValue(0),
      reconcileSignalLossRefresh: jest.fn().mockResolvedValue(0),
    } as any,
    { enqueueSessionOpenForFinalizedTrip: jest.fn() } as any,
    { ensureLvRestWindowForFinalizedTrip: jest.fn() } as any,
    restTargetProducer as any,
    { enqueueStartProxy: jest.fn() } as any,
    { reconcilePeriodic: jest.fn().mockResolvedValue(0) } as any,
    { ensureAssessmentHandoff: jest.fn().mockResolvedValue({ enqueued: false, skipped: true }) } as any,
  );

  const basePayload = (restTargetType: 'REST_60M' | 'REST_6H') => ({
    organizationId: ORG,
    vehicleId: VEH,
    idempotencyKey: `battery-rest:${VEH}:lv-rest:${VEH}:anchor:${restTargetType === 'REST_6H' ? '6h' : '60m'}`,
    restWindowId: `lv-rest:${VEH}:anchor`,
    restTargetType,
    sourceEntityId: SESSION,
    requestedAt: new Date().toISOString(),
    modelVersion: '1.0.0' as const,
    correlationId: 'corr-1',
    attemptContext: {
      attemptNumber: 1,
      maxAttempts: 3,
      enqueuedAt: new Date().toISOString(),
    },
  });

  return {
    handler,
    reconciliation,
    evaluation,
    restTargetProducer,
    basePayload,
    getTargetStatus: (type: 'REST_60M' | 'REST_6H') =>
      (sessionMetadata.scheduledTargets as any)?.[type]?.status,
    setTargetType: (type: 'REST_60M' | 'REST_6H') => {
      sessionRow.startedAt =
        type === 'REST_6H'
          ? new Date(Date.now() - 7 * 60 * 60_000)
          : new Date(Date.now() - 2 * 60 * 60_000);
      const scheduledTargets: Record<string, unknown> = {};
      if (type === 'REST_6H') {
        scheduledTargets.REST_60M = {
          idempotencyKey: `battery-rest:${VEH}:lv-rest:${VEH}:anchor:60m`,
          scheduledFor: sessionRow.startedAt.toISOString(),
          status: LV_REST_TARGET_JOB_STATUS.COMPLETED,
          completedAt: new Date().toISOString(),
        };
      }
      scheduledTargets[type] = {
        idempotencyKey: `battery-rest:${VEH}:lv-rest:${VEH}:anchor:${type === 'REST_6H' ? '6h' : '60m'}`,
        scheduledFor: sessionRow.startedAt.toISOString(),
        status: LV_REST_TARGET_JOB_STATUS.ENQUEUED,
      };
      sessionMetadata = {
        lvRestWindowState: LvRestWindowState.RESTING,
        scheduledTargets,
      };
    },
  };
}

describe('REST target PENDING_EVALUATION liveness', () => {
  it('REST_60M: retryable evaluation → PENDING_EVALUATION → reconciliation reschedule → COMPLETED', async () => {
    const ctx = buildHandlerAndReconciliation();
    ctx.setTargetType('REST_60M');

    ctx.evaluation.evaluateAndPersist.mockResolvedValueOnce({
      ok: false,
      reason: 'no_eligible_observation_in_target_window',
      retryable: true,
      missed: false,
    });

    await ctx.handler.handle(ctx.basePayload('REST_60M'));
    expect(ctx.getTargetStatus('REST_60M')).toBe(
      LV_REST_TARGET_JOB_STATUS.PENDING_EVALUATION,
    );

    const reconcileResult = await ctx.reconciliation.reconcileAll();
    expect(reconcileResult.restTargets).toBe(1);
    expect(ctx.restTargetProducer.scheduleRest60m).toHaveBeenCalled();

    ctx.evaluation.evaluateAndPersist.mockResolvedValueOnce({
      ok: true,
      measurementId: 'meas-60m',
      sourceObservationId: 'obs-60m',
      quality: 'VALID',
    });

    await ctx.handler.handle(ctx.basePayload('REST_60M'));
    expect(ctx.getTargetStatus('REST_60M')).toBe(LV_REST_TARGET_JOB_STATUS.COMPLETED);
  });

  it('REST_60M: grace expiry → MISSED (not infinite PENDING_EVALUATION)', async () => {
    const ctx = buildHandlerAndReconciliation();
    ctx.setTargetType('REST_60M');

    ctx.evaluation.evaluateAndPersist.mockResolvedValue({
      ok: false,
      reason: 'no_eligible_observation_in_target_window',
      retryable: false,
      missed: true,
      measurementId: 'meas-missed',
    });

    await ctx.handler.handle(ctx.basePayload('REST_60M'));
    expect(ctx.getTargetStatus('REST_60M')).toBe(LV_REST_TARGET_JOB_STATUS.MISSED);
  });

  it('REST_6H: retryable evaluation → PENDING_EVALUATION → reconciliation reschedule → COMPLETED', async () => {
    const ctx = buildHandlerAndReconciliation();
    ctx.setTargetType('REST_6H');

    ctx.evaluation.evaluateAndPersist.mockResolvedValueOnce({
      ok: false,
      reason: 'no_eligible_observation_in_target_window',
      retryable: true,
      missed: false,
    });

    await ctx.handler.handle(ctx.basePayload('REST_6H'));
    expect(ctx.getTargetStatus('REST_6H')).toBe(
      LV_REST_TARGET_JOB_STATUS.PENDING_EVALUATION,
    );

    const reconcileResult = await ctx.reconciliation.reconcileAll();
    expect(reconcileResult.restTargets).toBe(1);
    expect(ctx.restTargetProducer.scheduleRest6h).toHaveBeenCalled();

    ctx.evaluation.evaluateAndPersist.mockResolvedValueOnce({
      ok: true,
      measurementId: 'meas-6h',
      sourceObservationId: 'obs-6h',
      quality: 'VALID',
    });

    await ctx.handler.handle(ctx.basePayload('REST_6H'));
    expect(ctx.getTargetStatus('REST_6H')).toBe(LV_REST_TARGET_JOB_STATUS.COMPLETED);
  });
});

describe('repairCanonicalTripBindingIfNeeded mutation boundary', () => {
  const anchor = new Date('2026-08-30T12:05:53.000Z');

  function buildRepo(tripLookup: jest.Mock) {
    const prisma = {
      vehicleTrip: { findFirst: tripLookup },
      batteryMeasurementSession: {
        update: jest.fn(async ({ data }: any) => ({
          id: 'sess-1',
          organizationId: ORG,
          vehicleId: VEH,
          tripId: data.tripId,
          startedAt: anchor,
        })),
      },
    };
    return {
      repo: new BatteryMeasurementSessionRepository(prisma as any),
      prisma,
    };
  }

  it('repairs only when authoritative trip matches anchor (d8b4db92 shape)', async () => {
    const tripLookup = jest.fn(async ({ where }: any) => {
      if (where.id === TRIP_N) {
        return { id: TRIP_N, endTime: anchor };
      }
      return null;
    });
    const { repo, prisma } = buildRepo(tripLookup);

    await repo.repairCanonicalTripBindingIfNeeded(
      {
        id: 'sess-1',
        organizationId: ORG,
        vehicleId: VEH,
        tripId: TRIP_PREV,
        startedAt: anchor,
      },
      {
        organizationId: ORG,
        tripId: TRIP_N,
        startedAt: anchor,
        sourceEntityType: 'trip',
        sourceEntityId: TRIP_N,
      },
    );

    expect(prisma.batteryMeasurementSession.update).toHaveBeenCalled();
    expect(tripLookup).toHaveBeenCalled();
  });

  it('rejects rebinding when caller tripId does not match authoritative trip row', async () => {
    const tripLookup = jest.fn(async ({ where }: any) => {
      if (where.id === TRIP_N) {
        return null;
      }
      if (where.id === TRIP_PREV) {
        return { id: TRIP_PREV, endTime: anchor };
      }
      return null;
    });
    const { repo, prisma } = buildRepo(tripLookup);

    await repo.repairCanonicalTripBindingIfNeeded(
      {
        id: 'sess-1',
        organizationId: ORG,
        vehicleId: VEH,
        tripId: TRIP_PREV,
        startedAt: anchor,
      },
      {
        organizationId: ORG,
        tripId: TRIP_N,
        startedAt: anchor,
        sourceEntityType: 'trip',
        sourceEntityId: TRIP_N,
      },
    );

    expect(prisma.batteryMeasurementSession.update).not.toHaveBeenCalled();
  });

  it('rejects cross-organization rebinding', async () => {
    const tripLookup = jest.fn();
    const { repo, prisma } = buildRepo(tripLookup);

    await repo.repairCanonicalTripBindingIfNeeded(
      {
        id: 'sess-1',
        organizationId: ORG,
        vehicleId: VEH,
        tripId: TRIP_PREV,
        startedAt: anchor,
      },
      {
        organizationId: 'clorg9999999999999999999999',
        tripId: TRIP_N,
        startedAt: anchor,
        sourceEntityType: 'trip',
        sourceEntityId: TRIP_N,
      },
    );

    expect(tripLookup).not.toHaveBeenCalled();
    expect(prisma.batteryMeasurementSession.update).not.toHaveBeenCalled();
  });
});
