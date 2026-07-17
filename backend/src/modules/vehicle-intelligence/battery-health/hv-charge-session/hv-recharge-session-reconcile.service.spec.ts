import { BatteryMeasurementQuality } from '@prisma/client';
import { BatteryV2ProviderError } from '../jobs/battery-v2-job.errors';
import { HvRechargeSessionReconcileService } from './hv-recharge-session-reconcile.service';
import { HvRechargeSessionReconcileTrigger } from './hv-recharge-session-reconcile.trigger';
import type { HvChargeSessionIngestResult } from './hv-charge-session-ingest.service';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';

jest.mock('@config/battery-health-v2.config', () => {
  const actual = jest.requireActual('@config/battery-health-v2.config');
  return {
    ...actual,
    isBatteryV2HvRechargeSessionEnabled: jest.fn().mockReturnValue(true),
  };
});

import { isBatteryV2HvRechargeSessionEnabled } from '@config/battery-health-v2.config';

function mockSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    organizationId: ORG,
    vehicleId: VEH,
    measurementSessionId: null,
    segmentFingerprint: 'fp-1',
    dimoSegmentId: 'dimo-1',
    source: 'DIMO_RECHARGE_SEGMENT',
    startAt: new Date('2026-07-10T08:00:00.000Z'),
    endAt: new Date('2026-07-10T10:00:00.000Z'),
    startSocPercent: 40,
    endSocPercent: 50,
    startEnergyKwh: 20,
    endEnergyKwh: 30,
    energyAddedKwh: 10,
    deltaSocPercent: 10,
    isOngoing: false,
    quality: BatteryMeasurementQuality.VALID,
    idempotencyKey: 'hv-session:1',
    providerObservedAt: new Date('2026-07-10T10:00:00.000Z'),
    metadata: {},
    createdAt: new Date('2026-07-10T08:00:00.000Z'),
    updatedAt: new Date('2026-07-10T10:00:00.000Z'),
    ...overrides,
  };
}

function mockIngestResult(
  overrides: Partial<HvChargeSessionIngestResult> = {},
): HvChargeSessionIngestResult {
  const session = mockSessionRow();
  return {
    fetched: 1,
    created: 0,
    updated: 1,
    unchanged: 0,
    results: [
      {
        created: false,
        changed: true,
        changeKind: 'provider_refresh',
        session: session as never,
      },
    ],
    ...overrides,
  };
}

describe('HvRechargeSessionReconcileService', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
  };
  const hvMethodProfile = {
    resolveForVehicle: jest.fn(),
  };
  const ingest = {
    ingestForVehicle: jest.fn(),
    ingestSegmentByFingerprint: jest.fn(),
  };
  const fallbackDetector = {
    detectAndPersistForVehicle: jest.fn(),
  };
  const metrics = {
    hvRechargeSegmentsTotal: { inc: jest.fn() },
    hvChargeSessionsTotal: { inc: jest.fn() },
    batteryV2HvRechargeReconcileErrors: { inc: jest.fn() },
    batteryV2HvRechargeProviderDelay: { observe: jest.fn() },
  };

  let service: HvRechargeSessionReconcileService;

  beforeEach(() => {
    jest.clearAllMocks();
    (isBatteryV2HvRechargeSessionEnabled as jest.Mock).mockReturnValue(true);
    prisma.vehicle.findFirst.mockResolvedValue({
      dimoVehicle: { tokenId: 'token-1' },
    });
    hvMethodProfile.resolveForVehicle.mockResolvedValue({
      rechargeSegmentsAvailable: true,
    });
    service = new HvRechargeSessionReconcileService(
      prisma as never,
      hvMethodProfile as never,
      ingest as never,
      fallbackDetector as never,
      metrics as never,
    );
  });

  it('skips when feature flag is disabled', async () => {
    (isBatteryV2HvRechargeSessionEnabled as jest.Mock).mockReturnValue(false);

    const result = await service.reconcile({
      organizationId: ORG,
      vehicleId: VEH,
    });

    expect(result).toEqual({ skipped: true, skipReason: 'disabled' });
    expect(ingest.ingestForVehicle).not.toHaveBeenCalled();
  });

  it('skips fallback path when feature flag is disabled', async () => {
    hvMethodProfile.resolveForVehicle.mockResolvedValue({
      rechargeSegmentsAvailable: false,
    });
    fallbackDetector.detectAndPersistForVehicle.mockResolvedValue({
      skipped: true,
      skipReason: 'disabled',
      detected: 0,
      persisted: 0,
      rejectedFalsePositives: 0,
      results: [],
    });

    const result = await service.reconcile({
      organizationId: ORG,
      vehicleId: VEH,
    });

    expect(result.skipReason).toBe('capability_unavailable');
    expect(fallbackDetector.detectAndPersistForVehicle).toHaveBeenCalled();
  });

  it('delegates to fallback detector when recharge segments are unavailable', async () => {
    hvMethodProfile.resolveForVehicle.mockResolvedValue({
      rechargeSegmentsAvailable: false,
    });
    fallbackDetector.detectAndPersistForVehicle.mockResolvedValue({
      skipped: false,
      detected: 1,
      persisted: 1,
      rejectedFalsePositives: 0,
      results: [],
    });

    const result = await service.reconcile({
      organizationId: ORG,
      vehicleId: VEH,
    });

    expect(result.skipReason).toBe('capability_unavailable');
    expect(result.fallback?.persisted).toBe(1);
    expect(fallbackDetector.detectAndPersistForVehicle).toHaveBeenCalled();
    expect(ingest.ingestForVehicle).not.toHaveBeenCalled();
  });

  it('applies delayed provider data via rolling window ingest', async () => {
    const ingestResult = mockIngestResult({
      fetched: 2,
      created: 0,
      updated: 1,
      unchanged: 1,
    });
    ingest.ingestForVehicle.mockResolvedValue(ingestResult);

    const result = await service.reconcile({
      organizationId: ORG,
      vehicleId: VEH,
      trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
    });

    expect(result.skipped).toBe(false);
    expect(result.ingest).toEqual(ingestResult);
    expect(ingest.ingestForVehicle).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        vehicleId: VEH,
        from: expect.any(Date),
        to: expect.any(Date),
      }),
    );
    expect(metrics.hvChargeSessionsTotal.inc).toHaveBeenCalledWith(
      { trigger: 'PERIODIC', change: 'updated' },
      1,
    );
    expect(metrics.batteryV2HvRechargeProviderDelay.observe).toHaveBeenCalled();
  });

  it('treats duplicate reconciliation as unchanged (idempotent no-op)', async () => {
    const ingestResult = mockIngestResult({
      fetched: 1,
      created: 0,
      updated: 0,
      unchanged: 1,
      results: [
        {
          created: false,
          changed: false,
          changeKind: 'no_op',
          session: mockSessionRow() as never,
        },
      ],
    });
    ingest.ingestForVehicle.mockResolvedValue(ingestResult);

    const first = await service.reconcile({
      organizationId: ORG,
      vehicleId: VEH,
      trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
    });
    const second = await service.reconcile({
      organizationId: ORG,
      vehicleId: VEH,
      trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
    });

    expect(first.ingest?.unchanged).toBe(1);
    expect(second.ingest?.unchanged).toBe(1);
    expect(metrics.hvChargeSessionsTotal.inc).toHaveBeenCalledWith(
      { trigger: 'PERIODIC', change: 'unchanged' },
      1,
    );
  });

  it('wraps provider errors as retryable BatteryV2ProviderError', async () => {
    ingest.ingestForVehicle.mockRejectedValue(new Error('DIMO rate limited'));

    await expect(
      service.reconcile({
        organizationId: ORG,
        vehicleId: VEH,
        trigger: HvRechargeSessionReconcileTrigger.CHARGING_STATE,
      }),
    ).rejects.toBeInstanceOf(BatteryV2ProviderError);

    expect(metrics.batteryV2HvRechargeReconcileErrors.inc).toHaveBeenCalledWith({
      trigger: 'CHARGING_STATE',
      error_code: 'provider_error',
    });
  });

  it('reconciles single segment by fingerprint', async () => {
    ingest.ingestSegmentByFingerprint.mockResolvedValue({
      created: false,
      changed: true,
      changeKind: 'completed',
      session: mockSessionRow({ isOngoing: false }),
    });

    const result = await service.reconcile({
      organizationId: ORG,
      vehicleId: VEH,
      segmentFingerprint: 'fp-1',
      trigger: HvRechargeSessionReconcileTrigger.ONGOING_REFRESH,
    });

    expect(result.skipped).toBe(false);
    expect(result.ingest?.updated).toBe(1);
    expect(ingest.ingestSegmentByFingerprint).toHaveBeenCalledWith(
      expect.objectContaining({
        segmentFingerprint: 'fp-1',
      }),
    );
  });

  it('returns segment_not_found when fingerprint is missing from provider', async () => {
    ingest.ingestSegmentByFingerprint.mockResolvedValue(null);

    const result = await service.reconcile({
      organizationId: ORG,
      vehicleId: VEH,
      segmentFingerprint: 'missing-fp',
    });

    expect(result).toEqual({ skipped: true, skipReason: 'segment_not_found' });
    expect(metrics.batteryV2HvRechargeReconcileErrors.inc).toHaveBeenCalledWith({
      trigger: 'PERIODIC',
      error_code: 'segment_not_found',
    });
  });
});

describe('HvRechargeSessionReconcileProducerService', () => {
  const { HvRechargeSessionReconcileProducerService } = jest.requireActual(
    './hv-recharge-session-reconcile-producer.service',
  ) as typeof import('./hv-recharge-session-reconcile-producer.service');

  const prisma = {
    hvChargeSession: { findMany: jest.fn() },
    vehicleBatteryCapability: { findMany: jest.fn() },
  };
  const jobProducer = { enqueue: jest.fn() };
  const deadLetters = { isDeadLetter: jest.fn() };

  let producer: InstanceType<typeof HvRechargeSessionReconcileProducerService>;

  beforeEach(() => {
    jest.clearAllMocks();
    deadLetters.isDeadLetter.mockResolvedValue(false);
    jobProducer.enqueue.mockResolvedValue('job-1');
    prisma.hvChargeSession.findMany.mockResolvedValue([]);
    prisma.vehicleBatteryCapability.findMany.mockResolvedValue([]);
    producer = new HvRechargeSessionReconcileProducerService(
      prisma as never,
      jobProducer as never,
      deadLetters as never,
    );
  });

  it('enqueues periodic reconcile for ongoing sessions and capable vehicles', async () => {
    prisma.hvChargeSession.findMany.mockResolvedValue([
      { vehicleId: 'veh-ongoing', organizationId: ORG },
    ]);
    prisma.vehicleBatteryCapability.findMany.mockResolvedValue([
      { vehicleId: 'veh-capable', organizationId: ORG },
    ]);

    const enqueued = await producer.reconcilePeriodic(10);

    expect(enqueued).toBe(2);
    expect(jobProducer.enqueue).toHaveBeenCalledTimes(2);
  });

  it('skips enqueue when idempotency key is dead-lettered', async () => {
    deadLetters.isDeadLetter.mockResolvedValue(true);

    const jobId = await producer.enqueue({
      organizationId: ORG,
      vehicleId: VEH,
      trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
    });

    expect(jobId).toBeNull();
    expect(jobProducer.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues charging transition with delay', async () => {
    await producer.enqueueForChargingTransition({
      organizationId: ORG,
      vehicleId: VEH,
      isCharging: true,
      observedAt: new Date('2026-07-16T12:00:00.000Z'),
    });

    expect(jobProducer.enqueue).toHaveBeenCalledWith(
      'HV_RECHARGE_SESSION_RECONCILE',
      expect.objectContaining({
        reconcileTrigger: 'CHARGING_STATE',
      }),
      { delayMs: 30_000 },
    );
  });
});

describe('HvRechargeSessionReconcileHandler', () => {
  const { HvRechargeSessionReconcileHandler } = jest.requireActual(
    '../jobs/handlers/hv-recharge-session-reconcile.handler',
  ) as typeof import('../jobs/handlers/hv-recharge-session-reconcile.handler');

  it('throws retryable error when segment fingerprint is not found', async () => {
    const reconcile = {
      reconcile: jest.fn().mockResolvedValue({
        skipped: true,
        skipReason: 'segment_not_found',
      }),
    };
    const handler = new HvRechargeSessionReconcileHandler(reconcile as never);

    await expect(
      handler.handle({
        organizationId: ORG,
        vehicleId: VEH,
        idempotencyKey: 'hv-session:reconcile:1',
        segmentFingerprint: 'missing',
        reconcileTrigger: 'PERIODIC',
        requestedAt: '2026-07-16T10:00:00.000Z',
        modelVersion: '1.0.0',
        correlationId: 'corr-1',
        attemptContext: {
          attemptNumber: 1,
          maxAttempts: 3,
          enqueuedAt: '2026-07-16T10:00:00.000Z',
        },
      }),
    ).rejects.toBeInstanceOf(BatteryV2ProviderError);
  });
});
