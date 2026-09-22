import { BatteryGeneralizedEvidenceClass, BatteryProviderObservabilityGapStatus } from '@prisma/client';
import {
  BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV,
  BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV,
} from '@config/battery-health-v2.config';
import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { ProviderObservabilityGapService } from './provider-observability-gap.service';
import type { ClassifySnapshotObservationResult } from '../jobs/battery-v2-snapshot-observation.producer';

describe('ProviderObservabilityGapService (B1.2Y1.1)', () => {
  const originalGap = process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV];
  const originalGen = process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV];

  afterEach(() => {
    process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV] = originalGap;
    process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV] = originalGen;
  });

  function buildService(overrides: {
    openOrExtendGap?: jest.Mock;
    findOpenGap?: jest.Mock;
    resolveGap?: jest.Mock;
    vehicle?: object;
    policy?: object;
    policyResolveThrows?: Error;
    measurement?: object | null;
    generalizedRow?: object | null;
  }) {
    const prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue(
          overrides.vehicle ?? {
            fuelType: 'GASOLINE',
            hardwareType: 'LTE_R1',
            latestState: {
              speedKmh: 0,
              isIgnitionOn: false,
              engineLoad: 0,
              tractionBatteryIsCharging: false,
              tractionBatteryChargingPowerKw: null,
              online: true,
              lastSeenAt: new Date(),
              sourceTimestamp: new Date(),
              providerFetchedAt: new Date(),
              syncJobRef: null,
            },
            tripDetectionState: { activeTripId: null, lastActivityAt: null },
          },
        ),
      },
      batteryMeasurement: {
        findFirst: jest.fn().mockResolvedValue({ id: 'meas-1' }),
        findUnique: jest.fn().mockResolvedValue(
          overrides.measurement !== undefined
            ? overrides.measurement
            : {
                observedAt: new Date('2026-09-22T10:00:00Z'),
                providerTimestamp: null,
              },
        ),
      },
      batteryGeneralizedEvidenceObservation: {
        findFirst: jest.fn().mockResolvedValue(overrides.generalizedRow ?? null),
      },
    };

    const repository = {
      openOrExtendGap: overrides.openOrExtendGap ?? jest.fn().mockResolvedValue({ outcome: 'created', gapId: 'gap-1' }),
      findOpenGap: overrides.findOpenGap ?? jest.fn().mockResolvedValue(null),
      resolveGapIdempotent:
        overrides.resolveGap ??
        jest.fn().mockResolvedValue({ outcome: 'resolved', gapId: 'gap-1' }),
    };

    const batteryPolicy = {
      resolveForVehicle: overrides.policyResolveThrows
        ? jest.fn().mockRejectedValue(overrides.policyResolveThrows)
        : jest.fn().mockResolvedValue(overrides.policy ?? { driveProfile: 'ICE' }),
    };

    return new ProviderObservabilityGapService(
      prisma as never,
      repository as never,
      batteryPolicy as never,
    );
  }

  it('TEST_FLAG_DEPENDENCY: gap ON + generalized OFF => invalid combination', async () => {
    process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV] = 'true';
    process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV] = 'false';
    const service = buildService({});
    const classifyResult = {
      shouldEnqueue: false,
      lvDecision: {
        outcome: 'STALE_REPLAY',
        observedAt: new Date('2026-09-21T18:47:56Z'),
      },
      snapshotContext: { lvBatteryVoltage: 14.1, providerFetchedAt: new Date().toISOString() },
    } as ClassifySnapshotObservationResult;

    const result = await service.handleSuccessfulPollWithoutPersist(
      {
        organizationId: 'org',
        vehicleId: 'veh',
        receivedAt: new Date(),
        normalized: { lvBatteryVoltage: 14.1 } as never,
        batteryMap: {} as never,
        lvBatteryObservedAt: new Date('2026-09-21T18:47:56Z'),
      },
      classifyResult,
    );

    expect(result).toBe('skipped_invalid_flag_combination');
  });

  it('TEST_DUPLICATE_BEFORE_THRESHOLD: duplicate without OPEN gap does not open', async () => {
    process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV] = 'true';
    process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV] = 'true';
    const openOrExtendGap = jest.fn();
    const service = buildService({ openOrExtendGap, findOpenGap: jest.fn().mockResolvedValue(null) });

    const result = await service.handleSuccessfulPollWithoutPersist(
      {
        organizationId: 'org',
        vehicleId: 'veh',
        receivedAt: new Date(),
        normalized: { lvBatteryVoltage: 14.1 } as never,
        batteryMap: {} as never,
        lvBatteryObservedAt: new Date('2026-09-21T18:47:56Z'),
      },
      {
        shouldEnqueue: false,
        lvDecision: {
          outcome: 'DUPLICATE_OBSERVATION',
          observedAt: new Date('2026-09-21T18:47:56Z'),
        },
        snapshotContext: {
          lvBatteryVoltage: 14.1,
          providerFetchedAt: new Date().toISOString(),
          lvBatteryObservedAt: new Date('2026-09-21T18:47:56Z').toISOString(),
        },
      } as ClassifySnapshotObservationResult,
    );

    expect(result).toBe('skipped_duplicate_before_stale_threshold');
    expect(openOrExtendGap).not.toHaveBeenCalled();
  });

  it('TEST_PRE_GAP_OFF_NO_GAP: trustworthy pre-gap ENGINE_OFF skips gap open', async () => {
    process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV] = 'true';
    process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV] = 'true';
    const openOrExtendGap = jest.fn();
    const service = buildService({
      openOrExtendGap,
      vehicle: {
        fuelType: 'GASOLINE',
        hardwareType: 'LTE_R1',
        latestState: {
          speedKmh: 0,
          isIgnitionOn: false,
          engineLoad: 0,
          tractionBatteryIsCharging: false,
          tractionBatteryChargingPowerKw: null,
          online: true,
          lastSeenAt: new Date(),
          sourceTimestamp: new Date(),
          providerFetchedAt: new Date(),
          syncJobRef: null,
        },
        tripDetectionState: { activeTripId: null, lastActivityAt: null },
      },
    });

    const result = await service.handleSuccessfulPollWithoutPersist(
      {
        organizationId: 'org',
        vehicleId: 'veh',
        receivedAt: new Date(),
        normalized: { lvBatteryVoltage: 12.4 } as never,
        batteryMap: {} as never,
        lvBatteryObservedAt: new Date('2026-09-21T18:47:56Z'),
      },
      {
        shouldEnqueue: false,
        lvDecision: {
          outcome: 'STALE_REPLAY',
          observedAt: new Date('2026-09-21T18:47:56Z'),
        },
        snapshotContext: {
          lvBatteryVoltage: 12.4,
          providerFetchedAt: new Date().toISOString(),
          lvBatteryObservedAt: new Date('2026-09-21T18:47:56Z').toISOString(),
        },
      } as ClassifySnapshotObservationResult,
    );

    expect(result).toBe('skipped_pre_gap_trustworthy_off');
    expect(openOrExtendGap).not.toHaveBeenCalled();
  });

  it('does not resolve OFF without persisted ENGINE_OFF_TRANSITION', async () => {
    process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV] = 'true';
    process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV] = 'true';
    const resolveGap = jest.fn();
    const service = buildService({
      findOpenGap: jest.fn().mockResolvedValue({ id: 'gap-1' }),
      resolveGap,
    });

    const outcome = await service.tryResolveAfterFreshLvObservation({
      payload: { organizationId: 'org', vehicleId: 'veh', idempotencyKey: 'k' } as never,
      sourceMeasurementId: 'meas-2',
      evidenceClass: BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
      firstFreshProviderAt: new Date('2026-09-22T10:00:00Z'),
    });

    expect(outcome).toBe('remain_open');
    expect(resolveGap).not.toHaveBeenCalled();
  });

  it('resolves RUNNING without parallel OFF when generalized class is driving', async () => {
    process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV] = 'true';
    process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV] = 'true';
    const resolveGap = jest
      .fn()
      .mockResolvedValue({ outcome: 'resolved', gapId: 'gap-1' });
    const service = buildService({
      findOpenGap: jest.fn().mockResolvedValue({ id: 'gap-1' }),
      resolveGap,
    });

    const outcome = await service.tryResolveAfterFreshLvObservation({
      payload: { organizationId: 'org', vehicleId: 'veh', idempotencyKey: 'k' } as never,
      sourceMeasurementId: 'meas-2',
      evidenceClass: BatteryGeneralizedEvidenceClass.DRIVING_NON_CHARGING,
      firstFreshProviderAt: new Date('2026-09-22T10:00:00Z'),
    });

    expect(outcome).toBe('resolved');
    expect(resolveGap).toHaveBeenCalledTimes(1);
  });

  it('skips resolution without provider timestamp (no synthetic time)', async () => {
    process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV] = 'true';
    process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV] = 'true';
    const resolveGap = jest.fn();
    const service = buildService({
      findOpenGap: jest.fn().mockResolvedValue({ id: 'gap-1' }),
      resolveGap,
      measurement: null,
      generalizedRow: {
        evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
      },
    });

    const outcome = await service.tryResolveAfterFreshLvObservation({
      payload: { organizationId: 'org', vehicleId: 'veh', idempotencyKey: 'k' } as never,
      sourceMeasurementId: 'meas-missing',
    });

    expect(outcome).toBe('skipped_missing_provenance');
    expect(resolveGap).not.toHaveBeenCalled();
  });

  it('TEST_FAIL_OPEN_SCOPE_LOOKUP_FAILURE: policy lookup throw does not propagate', async () => {
    process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV] = 'true';
    process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV] = 'true';
    const inc = jest.fn();
    const service = buildService({
      policyResolveThrows: new Error('scope lookup exploded'),
    });
    (service as unknown as { metrics: TripMetricsService }).metrics = {
      batteryProviderObservabilityGapFailureTotal: { inc },
    } as never;

    const outcome = await service.handleSuccessfulPollWithoutPersist(
      {
        organizationId: 'org',
        vehicleId: 'veh',
        receivedAt: new Date(),
        normalized: { lvBatteryVoltage: 14.1 } as never,
        batteryMap: {} as never,
        lvBatteryObservedAt: new Date('2026-09-21T18:47:56Z'),
      },
      {
        shouldEnqueue: false,
        lvDecision: {
          outcome: 'STALE_REPLAY',
          observedAt: new Date('2026-09-21T18:47:56Z'),
        },
        snapshotContext: { lvBatteryVoltage: 14.1, providerFetchedAt: new Date().toISOString() },
      } as ClassifySnapshotObservationResult,
    );

    expect(outcome).toBe('unchanged');
    expect(inc).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'entry', reason: 'UNEXPECTED_ERROR' }),
    );
  });

  it('TEST_FAIL_OPEN_FIND_OPEN_GAP_FAILURE: findOpenGap throw does not propagate', async () => {
    process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV] = 'true';
    process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV] = 'true';
    const inc = jest.fn();
    const service = buildService({
      findOpenGap: jest.fn().mockRejectedValue(new Error('db read failed')),
    });
    (service as unknown as { metrics: TripMetricsService }).metrics = {
      batteryProviderObservabilityGapFailureTotal: { inc },
    } as never;

    const outcome = await service.handleSuccessfulPollWithoutPersist(
      {
        organizationId: 'org',
        vehicleId: 'veh',
        receivedAt: new Date(),
        normalized: { lvBatteryVoltage: 14.1 } as never,
        batteryMap: {} as never,
        lvBatteryObservedAt: new Date('2026-09-21T18:47:56Z'),
      },
      {
        shouldEnqueue: false,
        lvDecision: {
          outcome: 'STALE_REPLAY',
          observedAt: new Date('2026-09-21T18:47:56Z'),
        },
        snapshotContext: { lvBatteryVoltage: 14.1, providerFetchedAt: new Date().toISOString() },
      } as ClassifySnapshotObservationResult,
    );

    expect(outcome).toBe('unchanged');
    expect(inc).toHaveBeenCalled();
  });
});
