/**
 * Adversarial regression: ENQUEUED metadata without a live Bull job and without DLQ
 * must recover via reconciliation — never stall permanently.
 */
import {
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
} from '@prisma/client';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { BatteryRestTargetEvaluateHandler } from './handlers/battery-rest-target-evaluate.handler';
import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';
import { BatteryV2ReconciliationService } from './battery-v2-reconciliation.service';
import { LvRestWindowState } from '../battery-v2-domain';
import {
  LV_REST_TARGET_JOB_STATUS,
  LV_REST_TARGET_TYPES,
} from '../lv-rest-window/lv-rest-window-target.metadata';

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

function buildCtx(targetType: 'REST_60M' | 'REST_6H') {
  const startedAt =
    targetType === LV_REST_TARGET_TYPES.REST_6H
      ? new Date(Date.now() - 7 * 60 * 60_000)
      : new Date(Date.now() - 2 * 60 * 60_000);
  const windowId = `lv-rest:${VEH}:${startedAt.getTime()}`;
  const idempotencyKey = `battery-rest:${VEH}:${windowId}:${
    targetType === LV_REST_TARGET_TYPES.REST_6H ? '6h' : '60m'
  }`;

  let sessionMetadata: Record<string, unknown> = {
    lvRestWindowState: LvRestWindowState.RESTING,
    scheduledTargets: {
      ...(targetType === LV_REST_TARGET_TYPES.REST_6H
        ? {
            REST_60M: {
              idempotencyKey: `battery-rest:${VEH}:${windowId}:60m`,
              scheduledFor: startedAt.toISOString(),
              status: LV_REST_TARGET_JOB_STATUS.COMPLETED,
              completedAt: new Date().toISOString(),
            },
          }
        : {}),
      [targetType]: {
        idempotencyKey,
        scheduledFor: startedAt.toISOString(),
        status: LV_REST_TARGET_JOB_STATUS.ENQUEUED,
        bullJobId: 'orphan-job-id',
        enqueuedAt: startedAt.toISOString(),
      },
    },
  };

  let updatedAt = new Date('2026-08-30T11:00:00.000Z');
  const sessionRow = {
    id: SESSION,
    organizationId: ORG,
    vehicleId: VEH,
    startedAt,
    idempotencyKey: windowId,
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
      update: jest.fn(async ({ data }: { data: { metadata: unknown } }) => {
        sessionMetadata = data.metadata as Record<string, unknown>;
        return { ...sessionRow, metadata: sessionMetadata };
      }),
      updateMany: jest.fn(async ({ data, where }: { data: { metadata: unknown }; where?: { updatedAt?: Date } }) => {
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
    $queryRaw: jest.fn().mockResolvedValue([]),
    vehicleLatestState: { findMany: jest.fn().mockResolvedValue([]) },
    batteryFeatures: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleTrip: { findMany: jest.fn().mockResolvedValue([]) },
    batteryAssessment: { findFirst: jest.fn() },
    hvBatteryHealthSnapshot: { findFirst: jest.fn() },
    batteryHealthSnapshot: { findFirst: jest.fn() },
  };

  const deadLetters = {
    isDeadLetter: jest.fn().mockResolvedValue(false),
    clearDeadLetter: jest.fn().mockResolvedValue(true),
  };

  const jobProducer = {
    enqueue: jest.fn(),
    hasLiveJob: jest.fn().mockResolvedValue(false),
  };

  const restTargetProducer = {
    scheduleRest60m: jest.fn().mockResolvedValue({
      scheduled: true,
      skipped: false,
      idempotencyKey: `battery-rest:${VEH}:${windowId}:60m`,
      scheduledFor: new Date(),
      delayMs: 0,
      bullJobId: 'recovery-60m',
    }),
    scheduleRest6h: jest.fn().mockResolvedValue({
      scheduled: true,
      skipped: false,
      idempotencyKey: `battery-rest:${VEH}:${windowId}:6h`,
      scheduledFor: new Date(),
      delayMs: 0,
      bullJobId: 'recovery-6h',
    }),
    buildScheduledTargetMetadata: jest.fn((_result: unknown, type: string) => ({
      idempotencyKey: `battery-rest:${VEH}:${windowId}:${
        type === 'REST_6H' ? '6h' : '60m'
      }`,
      scheduledFor: new Date().toISOString(),
      status: LV_REST_TARGET_JOB_STATUS.ENQUEUED,
      bullJobId: 'recovery-job',
    })),
    getRest60mDelayMs: jest.fn().mockReturnValue(3600000),
    getRest6hDelayMs: jest.fn().mockReturnValue(21600000),
  };

  const evaluation = { evaluateAndPersist: jest.fn() };

  const handler = new BatteryRestTargetEvaluateHandler(
    prisma as never,
    evaluation as never,
    { recordLvRestShadowMeasurement: jest.fn() } as never,
    { ensureAssessmentHandoff: jest.fn().mockResolvedValue({ enqueued: false, skipped: true }) } as never,
  );

  const reconciliation = new BatteryV2ReconciliationService(
    prisma as never,
    jobProducer as never,
    { classifyAndEnqueue: jest.fn() } as never,
    deadLetters as never,
    {
      reconcilePeriodicRefresh: jest.fn().mockResolvedValue(0),
      reconcileSignalLossRefresh: jest.fn().mockResolvedValue(0),
    } as never,
    { enqueueSessionOpenForFinalizedTrip: jest.fn() } as never,
    { ensureLvRestWindowForFinalizedTrip: jest.fn() } as never,
    restTargetProducer as never,
    { enqueueStartProxy: jest.fn() } as never,
    { reconcilePeriodic: jest.fn().mockResolvedValue(0) } as never,
    { ensureAssessmentHandoff: jest.fn().mockResolvedValue({ enqueued: false, skipped: true }) } as never,
  );

  const basePayload = () => ({
    organizationId: ORG,
    vehicleId: VEH,
    idempotencyKey,
    restWindowId: windowId,
    restTargetType: targetType,
    sourceEntityId: SESSION,
    requestedAt: new Date().toISOString(),
    modelVersion: '1.0.0' as const,
    correlationId: 'corr-orphan',
    attemptContext: {
      attemptNumber: 1,
      maxAttempts: 3,
      enqueuedAt: new Date().toISOString(),
    },
  });

  return {
    targetType,
    idempotencyKey,
    handler,
    reconciliation,
    evaluation,
    restTargetProducer,
    jobProducer,
    deadLetters,
    prisma,
    basePayload,
    getTargetStatus: () =>
      (sessionMetadata.scheduledTargets as Record<string, { status: string }>)?.[
        targetType
      ]?.status,
  };
}

describe('orphaned ENQUEUED REST target liveness (no Bull job, no DLQ)', () => {
  beforeEach(() => {
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
  });

  it('REST_60M: orphaned ENQUEUED → reconciliation → recovery → COMPLETED', async () => {
    const ctx = buildCtx('REST_60M');

    const reconcileResult = await ctx.reconciliation.reconcileAll();
    expect(reconcileResult.restTargets).toBe(1);
    expect(ctx.jobProducer.hasLiveJob).toHaveBeenCalledWith(ctx.idempotencyKey);
    expect(ctx.deadLetters.isDeadLetter).toHaveBeenCalled();
    expect(ctx.deadLetters.clearDeadLetter).not.toHaveBeenCalled();
    expect(ctx.restTargetProducer.scheduleRest60m).toHaveBeenCalledWith(
      expect.objectContaining({ recovery: true }),
    );

    ctx.evaluation.evaluateAndPersist.mockResolvedValueOnce({
      ok: true,
      measurementId: 'meas-60m',
      sourceObservationId: 'obs-60m',
      quality: 'VALID',
    });
    await ctx.handler.handle(ctx.basePayload());
    expect(ctx.getTargetStatus()).toBe(LV_REST_TARGET_JOB_STATUS.COMPLETED);
  });

  it('REST_6H: orphaned ENQUEUED → reconciliation → recovery → COMPLETED', async () => {
    const ctx = buildCtx('REST_6H');

    const reconcileResult = await ctx.reconciliation.reconcileAll();
    expect(reconcileResult.restTargets).toBe(1);
    expect(ctx.restTargetProducer.scheduleRest6h).toHaveBeenCalledWith(
      expect.objectContaining({ recovery: true }),
    );

    ctx.evaluation.evaluateAndPersist.mockResolvedValueOnce({
      ok: true,
      measurementId: 'meas-6h',
      sourceObservationId: 'obs-6h',
      quality: 'VALID',
    });
    await ctx.handler.handle(ctx.basePayload());
    expect(ctx.getTargetStatus()).toBe(LV_REST_TARGET_JOB_STATUS.COMPLETED);
  });

  it('REST_60M: orphaned ENQUEUED → recovery → grace exhausted → MISSED', async () => {
    const ctx = buildCtx('REST_60M');

    await ctx.reconciliation.reconcileAll();

    ctx.evaluation.evaluateAndPersist.mockResolvedValue({
      ok: false,
      reason: 'no_eligible_observation_in_target_window',
      retryable: false,
      missed: true,
      measurementId: 'meas-missed',
    });
    await ctx.handler.handle(ctx.basePayload());
    expect(ctx.getTargetStatus()).toBe(LV_REST_TARGET_JOB_STATUS.MISSED);
  });

  it('keeps ENQUEUED when Bull job is still live (waiting)', async () => {
    const ctx = buildCtx('REST_60M');
    ctx.jobProducer.hasLiveJob.mockResolvedValueOnce(true);

    const reconcileResult = await ctx.reconciliation.reconcileAll();
    expect(reconcileResult.restTargets).toBe(0);
    expect(ctx.restTargetProducer.scheduleRest60m).not.toHaveBeenCalled();
    expect(ctx.getTargetStatus()).toBe(LV_REST_TARGET_JOB_STATUS.ENQUEUED);
  });

  it('idempotent: duplicate reconciliation ticks schedule exactly one recovery job', async () => {
    const ctx = buildCtx('REST_60M');

    const first = await ctx.reconciliation.reconcileAll();
    ctx.jobProducer.hasLiveJob.mockResolvedValue(true);
    const second = await ctx.reconciliation.reconcileAll();

    expect(first.restTargets).toBe(1);
    expect(second.restTargets).toBe(0);
    expect(ctx.restTargetProducer.scheduleRest60m).toHaveBeenCalledTimes(1);
  });

  it('concurrent reconciliation: two replicas may schedule once each; Bull enqueue dedupes', async () => {
    const ctx = buildCtx('REST_60M');

    const [a, b] = await Promise.all([
      ctx.reconciliation.reconcileAll(),
      ctx.reconciliation.reconcileAll(),
    ]);

    expect(a.restTargets + b.restTargets).toBeGreaterThanOrEqual(1);
    expect(ctx.restTargetProducer.scheduleRest60m.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(ctx.restTargetProducer.scheduleRest60m.mock.calls.length).toBeLessThanOrEqual(2);
  });
});

describe('BatteryV2JobProducerService.hasLiveJob', () => {
  beforeEach(() => {
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
  });

  it('returns true for waiting/delayed/active/prioritized jobs', async () => {
    for (const state of ['waiting', 'delayed', 'active', 'prioritized'] as const) {
      const queue = {
        getJob: jest.fn().mockResolvedValue({
          getState: async () => state,
        }),
      };
      const producer = new BatteryV2JobProducerService(
        queue as never,
        { isDeadLetter: jest.fn() } as never,
      );
      await expect(producer.hasLiveJob('battery-rest:test:60m')).resolves.toBe(true);
    }
  });

  it('returns false when job is missing or terminal', async () => {
    const queueMissing = { getJob: jest.fn().mockResolvedValue(null) };
    const producerMissing = new BatteryV2JobProducerService(
      queueMissing as never,
      { isDeadLetter: jest.fn() } as never,
    );
    await expect(producerMissing.hasLiveJob('battery-rest:test:60m')).resolves.toBe(false);

    const queueFailed = {
      getJob: jest.fn().mockResolvedValue({
        getState: async () => 'failed',
      }),
    };
    const producerFailed = new BatteryV2JobProducerService(
      queueFailed as never,
      { isDeadLetter: jest.fn() } as never,
    );
    await expect(producerFailed.hasLiveJob('battery-rest:test:60m')).resolves.toBe(false);
  });
});
