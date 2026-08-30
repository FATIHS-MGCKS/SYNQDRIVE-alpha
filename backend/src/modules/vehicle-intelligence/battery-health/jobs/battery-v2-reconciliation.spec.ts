import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';
import { BatteryV2ReconciliationService } from './battery-v2-reconciliation.service';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { buildRestTargetJobIdempotencyKey } from './battery-v2-job-idempotency.policy';

jest.mock('@config/battery-health-v2.config', () => {
  const actual = jest.requireActual('@config/battery-health-v2.config');
  return {
    ...actual,
    isBatteryV2RestShadowEnabled: jest.fn().mockReturnValue(true),
  };
});

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';

function mockDeadLetters(overrides: Partial<{ isDeadLetter: jest.Mock; clearDeadLetter: jest.Mock }> = {}) {
  return {
    isDeadLetter: jest.fn().mockResolvedValue(false),
    clearDeadLetter: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('BatteryV2JobProducerService hardening', () => {
  beforeEach(() => {
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
  });

  it('removes terminal failed jobs before re-enqueue', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const queue = {
      getJob: jest.fn().mockResolvedValue({
        getState: async () => 'failed',
        remove,
      }),
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const producer = new BatteryV2JobProducerService(queue as any, mockDeadLetters() as any);

    const startedAt = new Date('2026-07-16T08:00:00.000Z');
    const idempotencyKey = buildRestTargetJobIdempotencyKey({
      vehicleId: VEH,
      restWindowStartedAt: startedAt,
      restTargetType: 'REST_60M',
    });

    await producer.enqueue('BATTERY_REST_TARGET_EVALUATE', {
      organizationId: ORG,
      vehicleId: VEH,
      idempotencyKey,
      restWindowId: `lv-rest:${VEH}:${startedAt.getTime()}`,
      restWindowStartedAt: startedAt.toISOString(),
      restTargetType: 'REST_60M',
    });

    expect(remove).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalled();
  });

  it('skips enqueue when idempotency key is in dead letter', async () => {
    const queue = {
      getJob: jest.fn(),
      add: jest.fn(),
    };
    const deadLetters = mockDeadLetters({
      isDeadLetter: jest.fn().mockResolvedValue(true),
    });
    const producer = new BatteryV2JobProducerService(queue as any, deadLetters as any);

    const result = await producer.enqueue('BATTERY_REST_TARGET_EVALUATE', {
      organizationId: ORG,
      vehicleId: VEH,
      idempotencyKey: `rest-target:${VEH}:REST_60M:123`,
      restWindowId: `lv-rest:${VEH}:123`,
      restWindowStartedAt: new Date().toISOString(),
      restTargetType: 'REST_60M',
    });

    expect(result).toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues when dead letter exists but ignoreDeadLetter recovery flag is set', async () => {
    const queue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const deadLetters = mockDeadLetters({
      isDeadLetter: jest.fn().mockResolvedValue(true),
    });
    const producer = new BatteryV2JobProducerService(queue as any, deadLetters as any);

    const result = await producer.enqueue(
      'BATTERY_REST_TARGET_EVALUATE',
      {
        organizationId: ORG,
        vehicleId: VEH,
        idempotencyKey: `rest-target:${VEH}:REST_60M:123`,
        restWindowId: `lv-rest:${VEH}:123`,
        restWindowStartedAt: new Date().toISOString(),
        restTargetType: 'REST_60M',
      },
      { ignoreDeadLetter: true },
    );

    expect(result).not.toBeNull();
    expect(deadLetters.isDeadLetter).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalled();
  });
});

describe('BatteryV2ReconciliationService', () => {
  const prisma = {
    vehicleLatestState: { findMany: jest.fn().mockResolvedValue([]) },
    batteryFeatures: { findMany: jest.fn().mockResolvedValue([]) },
    batteryMeasurementSession: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    batteryMeasurement: { findFirst: jest.fn().mockResolvedValue(null) },
    vehicleTrip: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    vehicleTripDetectionState: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleEnergyEvent: { findMany: jest.fn().mockResolvedValue([]) },
    hvChargeSession: { findUnique: jest.fn() },
    batteryAssessment: { findFirst: jest.fn() },
    hvBatteryHealthSnapshot: { findFirst: jest.fn() },
    batteryHealthSnapshot: { findFirst: jest.fn() },
  };

  const jobProducer = { enqueue: jest.fn().mockResolvedValue('job-id') };
  const observationProducer = { classifyAndEnqueue: jest.fn().mockResolvedValue(null) };
  const deadLetters = mockDeadLetters();
  const capabilityRefresh = {
    reconcilePeriodicRefresh: jest.fn().mockResolvedValue(0),
    reconcileSignalLossRefresh: jest.fn().mockResolvedValue(0),
  };
  const restTargetProducer = {
    scheduleRest60m: jest.fn().mockResolvedValue({
      scheduled: true,
      skipped: false,
      idempotencyKey: 'battery-rest:60m',
      scheduledFor: new Date(),
      delayMs: 0,
      bullJobId: 'job-60m',
    }),
    scheduleRest6h: jest.fn().mockResolvedValue({
      scheduled: true,
      skipped: false,
      idempotencyKey: 'battery-rest:6h',
      scheduledFor: new Date(),
      delayMs: 0,
      bullJobId: 'job-6h',
    }),
    buildScheduledTargetMetadata: jest.fn().mockReturnValue({
      idempotencyKey: 'battery-rest:60m',
      scheduledFor: new Date().toISOString(),
      enqueuedAt: new Date().toISOString(),
      bullJobId: 'job-60m',
      status: 'ENQUEUED',
    }),
    getRest60mDelayMs: jest.fn().mockReturnValue(60 * 60_000),
    getRest6hDelayMs: jest.fn().mockReturnValue(6 * 60 * 60_000),
  };
  const lvRestSessionProducer = {
    enqueueSessionOpenForFinalizedTrip: jest.fn().mockResolvedValue('job-id'),
    canEnqueueForVehicle: jest.fn().mockResolvedValue(true),
  };
  const sessionArming = {
    ensureLvRestWindowForFinalizedTrip: jest
      .fn()
      .mockResolvedValue({ outcome: 'opened', sessionId: 'sess-new' }),
  };
  const tripStartProducer = { enqueueStartProxy: jest.fn().mockResolvedValue('job-id') };
  const rechargeReconcileProducer = {
    reconcilePeriodic: jest.fn().mockResolvedValue(0),
    enqueue: jest.fn().mockResolvedValue('job-id'),
    enqueueForChargingTransition: jest.fn().mockResolvedValue('job-id'),
    enqueueAfterCapabilityRefresh: jest.fn().mockResolvedValue('job-id'),
  };

  let service: BatteryV2ReconciliationService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.batteryFeatures.findMany.mockResolvedValue([]);
    prisma.vehicleEnergyEvent.findMany.mockResolvedValue([]);
    prisma.batteryMeasurementSession.findMany.mockResolvedValue([]);
    prisma.batteryMeasurement.findFirst.mockResolvedValue(null);
    service = new BatteryV2ReconciliationService(
      prisma as any,
      jobProducer as any,
      observationProducer as any,
      deadLetters as any,
      capabilityRefresh as any,
      lvRestSessionProducer as any,
      sessionArming as any,
      restTargetProducer as any,
      tripStartProducer as any,
      rechargeReconcileProducer as any,
    );
  });

  it('repairs a missing LV rest session from authoritative COMPLETED trips (scenario C)', async () => {
    const anchor = new Date(Date.now() - 10 * 60_000);
    prisma.vehicleTrip.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      if (args.where?.endTime != null && args.where?.tripStatus === 'COMPLETED') {
        return [
          {
            id: 'trip-1',
            vehicleId: VEH,
            endTime: anchor,
            vehicle: { organizationId: ORG },
          },
        ];
      }
      return [];
    });
    prisma.batteryMeasurementSession.findFirst.mockResolvedValue(null);

    const result = await service.reconcileAll();

    expect(result.restSessions).toBe(1);
    expect(sessionArming.ensureLvRestWindowForFinalizedTrip).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        vehicleId: VEH,
        tripId: 'trip-1',
      }),
    );
    expect(
      lvRestSessionProducer.enqueueSessionOpenForFinalizedTrip,
    ).not.toHaveBeenCalled();
  });

  it('repairs trip A even when the vehicle has already started trip B (Phase 3 adversarial)', async () => {
    const anchorA = new Date(Date.now() - 10 * 60_000);
    const anchorB = new Date(Date.now() - 3 * 60_000);
    prisma.vehicleTrip.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      if (args.where?.endTime != null && args.where?.tripStatus === 'COMPLETED') {
        return [
          {
            id: 'trip-b',
            vehicleId: VEH,
            endTime: anchorB,
            vehicle: { organizationId: ORG },
          },
          {
            id: 'trip-a',
            vehicleId: VEH,
            endTime: anchorA,
            vehicle: { organizationId: ORG },
          },
        ];
      }
      return [];
    });
    prisma.batteryMeasurementSession.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.idempotencyKey === `lv-rest:${VEH}:${anchorB.getTime()}`) {
        return { id: 'sess-b' };
      }
      return null;
    });

    const result = await service.reconcileAll();

    expect(result.restSessions).toBe(1);
    expect(sessionArming.ensureLvRestWindowForFinalizedTrip).toHaveBeenCalledTimes(1);
    expect(sessionArming.ensureLvRestWindowForFinalizedTrip).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 'trip-a',
      }),
    );
    expect(lvRestSessionProducer.enqueueSessionOpenForFinalizedTrip).not.toHaveBeenCalled();
    expect(prisma.vehicleTripDetectionState.findMany).not.toHaveBeenCalled();
  });

  it('does not re-enqueue session open when the canonical session already exists (E)', async () => {
    const anchor = new Date(Date.now() - 10 * 60_000);
    prisma.vehicleTrip.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      if (args.where?.endTime != null && args.where?.tripStatus === 'COMPLETED') {
        return [
          {
            id: 'trip-1',
            vehicleId: VEH,
            endTime: anchor,
            vehicle: { organizationId: ORG },
          },
        ];
      }
      return [];
    });
    prisma.batteryMeasurementSession.findFirst.mockResolvedValueOnce({
      id: 'sess-existing',
    });

    const result = await service.reconcileAll();

    expect(result.restSessions).toBe(0);
    expect(
      lvRestSessionProducer.enqueueSessionOpenForFinalizedTrip,
    ).not.toHaveBeenCalled();
  });

  it('skips missing-session recovery when no completed trips are in the settle window', async () => {
    prisma.vehicleTrip.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      if (args.where?.endTime != null && args.where?.tripStatus === 'COMPLETED') {
        return [];
      }
      return [];
    });

    const result = await service.reconcileAll();

    expect(result.restSessions).toBe(0);
    expect(sessionArming.ensureLvRestWindowForFinalizedTrip).not.toHaveBeenCalled();
    expect(
      lvRestSessionProducer.enqueueSessionOpenForFinalizedTrip,
    ).not.toHaveBeenCalled();
  });

  it('falls back to recovery enqueue when direct arming is not eligible', async () => {
    const anchor = new Date(Date.now() - 10 * 60_000);
    prisma.vehicleTrip.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      if (args.where?.endTime != null && args.where?.tripStatus === 'COMPLETED') {
        return [
          {
            id: 'trip-1',
            vehicleId: VEH,
            endTime: anchor,
            vehicle: { organizationId: ORG },
          },
        ];
      }
      return [];
    });
    prisma.batteryMeasurementSession.findFirst.mockResolvedValue(null);
    sessionArming.ensureLvRestWindowForFinalizedTrip.mockResolvedValueOnce({
      outcome: 'not_eligible',
      reason: 'policy_blocked',
    });

    const result = await service.reconcileAll();

    expect(result.restSessions).toBe(1);
    expect(lvRestSessionProducer.enqueueSessionOpenForFinalizedTrip).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 'trip-1',
        tripEndedAt: anchor,
        recovery: true,
      }),
    );
  });

  it('rescues PENDING_EVALUATION REST_60M target for reconciliation reschedule', async () => {
    const startedAt = new Date(Date.now() - 2 * 60 * 60_000);
    const windowId = `lv-rest:${VEH}:${startedAt.getTime()}`;
    prisma.batteryMeasurementSession.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.tripId?.not != null) {
        return [];
      }
      return [
        {
          id: 'sess-pending',
          organizationId: ORG,
          vehicleId: VEH,
          startedAt,
          idempotencyKey: windowId,
          metadata: {
            lvRestWindowState: 'RESTING',
            scheduledTargets: {
              REST_60M: {
                idempotencyKey: `battery-rest:${VEH}:${windowId}:60m`,
                scheduledFor: startedAt.toISOString(),
                status: 'PENDING_EVALUATION',
                lastAttemptAt: new Date().toISOString(),
              },
            },
          },
          status: 'ACTIVE',
        },
      ];
    });

    const result = await service.reconcileAll();

    expect(result.restTargets).toBe(1);
    expect(restTargetProducer.scheduleRest60m).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-pending',
        recovery: true,
      }),
    );
  });

  it('rescues stuck ENQUEUED REST target after PROVIDER_UNAVAILABLE dead letter', async () => {
    const startedAt = new Date(Date.now() - 2 * 60 * 60_000);
    const windowId = `lv-rest:${VEH}:${startedAt.getTime()}`;
    const idempotencyKey = `battery-rest:${VEH}:${windowId}:60m`;
    prisma.batteryMeasurementSession.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.tripId?.not != null) {
        return [];
      }
      return [
        {
          id: 'sess-stuck',
          organizationId: ORG,
          vehicleId: VEH,
          startedAt,
          idempotencyKey: windowId,
          metadata: {
            lvRestWindowState: 'RESTING',
            scheduledTargets: {
              REST_60M: {
                idempotencyKey,
                scheduledFor: startedAt.toISOString(),
                status: 'ENQUEUED',
              },
            },
          },
          status: 'ACTIVE',
        },
      ];
    });
    deadLetters.isDeadLetter.mockResolvedValueOnce(true);

    const result = await service.reconcileAll();

    expect(result.restTargets).toBe(1);
    expect(deadLetters.clearDeadLetter).toHaveBeenCalledWith(
      'BATTERY_REST_TARGET_EVALUATE',
      idempotencyKey,
    );
    expect(restTargetProducer.scheduleRest60m).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-stuck',
        recovery: true,
      }),
    );
  });

  it('schedules targets for PLANNED (candidate) LV rest sessions armed without promotion', async () => {
    const startedAt = new Date(Date.now() - 2 * 60 * 60_000);
    const windowId = `lv-rest:${VEH}:${startedAt.getTime()}`;
    prisma.batteryMeasurementSession.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.tripId?.not != null) {
        return [];
      }
      return [
        {
          id: 'sess-candidate',
          organizationId: ORG,
          vehicleId: VEH,
          startedAt,
          idempotencyKey: windowId,
          metadata: { lvRestWindowState: 'CANDIDATE' },
          status: 'PLANNED',
        },
      ];
    });

    const result = await service.reconcileAll();

    expect(result.restTargets).toBe(1);
    expect(restTargetProducer.scheduleRest60m).toHaveBeenCalledWith(
      expect.objectContaining({
        restWindowId: windowId,
        sessionId: 'sess-candidate',
      }),
    );
  });

  it('reconciles LV rest window targets without duplicate schedule metadata', async () => {
    const startedAt = new Date(Date.now() - 2 * 60 * 60_000);
    const windowId = `lv-rest:${VEH}:${startedAt.getTime()}`;
    let sessionRow = {
      id: 'sess-1',
      organizationId: ORG,
      vehicleId: VEH,
      startedAt,
      idempotencyKey: windowId,
      metadata: { lvRestWindowState: 'RESTING' } as Record<string, unknown>,
      status: 'ACTIVE',
    };
    prisma.batteryMeasurementSession.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.tripId?.not != null) {
        return [];
      }
      return [sessionRow];
    });
    prisma.batteryMeasurementSession.update.mockImplementation(async ({ data }: any) => {
      sessionRow = { ...sessionRow, metadata: data.metadata };
      return sessionRow;
    });

    const first = await service.reconcileAll();
    const second = await service.reconcileAll();

    expect(first.restTargets).toBe(1);
    expect(second.restTargets).toBe(0);
    expect(restTargetProducer.scheduleRest60m).toHaveBeenCalledTimes(1);
  });

  it('reconciles REST_6H target after six hours without duplicate metadata', async () => {
    const startedAt = new Date(Date.now() - 7 * 60 * 60_000);
    const windowId = `lv-rest:${VEH}:${startedAt.getTime()}`;
    prisma.batteryMeasurementSession.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.tripId?.not != null) {
        return [];
      }
      return [
        {
          id: 'sess-6h',
          organizationId: ORG,
          vehicleId: VEH,
          startedAt,
          idempotencyKey: windowId,
          metadata: {
            lvRestWindowState: 'RESTING',
            scheduledTargets: {
              REST_60M: {
                idempotencyKey: `battery-rest:${VEH}:${windowId}:60m`,
                scheduledFor: startedAt.toISOString(),
                status: 'ENQUEUED',
              },
            },
          },
          status: 'ACTIVE',
        },
      ];
    });

    const result = await service.reconcileAll();
    expect(result.restTargets).toBe(1);
    expect(restTargetProducer.scheduleRest6h).toHaveBeenCalledTimes(1);
    expect(restTargetProducer.scheduleRest60m).not.toHaveBeenCalled();
  });

  it('reconciles legacy battery_features via canonical rest target producer when LV session exists', async () => {
    const startedAt = new Date(Date.now() - 2 * 60 * 60_000);
    const windowId = `lv-rest:${VEH}:${startedAt.getTime()}`;
    const legacySession = {
      id: 'sess-legacy',
      organizationId: ORG,
      vehicleId: VEH,
      startedAt,
      idempotencyKey: windowId,
      metadata: { lvRestWindowState: 'RESTING' },
      status: 'ACTIVE',
    };
    prisma.batteryMeasurementSession.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.tripId?.not != null) {
        return [];
      }
      return [];
    });
    prisma.batteryMeasurementSession.findFirst.mockResolvedValue(legacySession);
    prisma.batteryMeasurementSession.update.mockImplementation(async ({ data }) => {
      legacySession.metadata = data.metadata as typeof legacySession.metadata;
      return legacySession;
    });
    prisma.batteryFeatures.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      if (args.where?.restWindowStartedAt != null) {
        return [
          {
            vehicleId: VEH,
            restWindowStartedAt: startedAt,
            rest60mCapturedAt: null,
            rest6hCapturedAt: null,
            vehicle: { organizationId: ORG },
          },
        ];
      }
      return [];
    });

    const first = await service.reconcileAll();
    const second = await service.reconcileAll();

    expect(first.restTargets).toBe(1);
    expect(second.restTargets).toBe(0);
    expect(restTargetProducer.scheduleRest60m).toHaveBeenCalledTimes(1);
    expect(restTargetProducer.scheduleRest60m).toHaveBeenCalledWith(
      expect.objectContaining({
        restWindowId: windowId,
        sessionId: 'sess-legacy',
      }),
    );
    expect(jobProducer.enqueue).not.toHaveBeenCalled();
  });

  it('skips legacy battery_features reconciliation when no LV rest session exists', async () => {
    const startedAt = new Date(Date.now() - 2 * 60 * 60_000);
    prisma.batteryMeasurementSession.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.tripId?.not != null) {
        return [];
      }
      return [];
    });
    prisma.batteryMeasurementSession.findFirst.mockResolvedValue(null);
    prisma.batteryFeatures.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      if (args.where?.restWindowStartedAt != null) {
        return [
          {
            vehicleId: VEH,
            restWindowStartedAt: startedAt,
            rest60mCapturedAt: null,
            rest6hCapturedAt: null,
            vehicle: { organizationId: ORG },
          },
        ];
      }
      return [];
    });

    const result = await service.reconcileAll();

    expect(result.restTargets).toBe(0);
    expect(restTargetProducer.scheduleRest60m).not.toHaveBeenCalled();
    expect(jobProducer.enqueue).not.toHaveBeenCalled();
  });

  it('delegates periodic recharge reconcile to producer', async () => {
    rechargeReconcileProducer.reconcilePeriodic.mockResolvedValue(2);

    const result = await service.reconcileAll();
    expect(result.rechargeSegments).toBe(2);
    expect(rechargeReconcileProducer.reconcilePeriodic).toHaveBeenCalled();
  });
});
