import { randomUUID } from 'crypto';
import { BatteryGeneralizedEvidenceClass } from '@prisma/client';
import {
  BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV,
  BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV,
} from '@config/battery-health-v2.config';
import { GeneralizedEvidenceCaptureService } from './generalized-evidence-capture.service';
import { restoreProcessEnv } from '../testing/battery-v2-process-env.test-util';

describe('GeneralizedEvidenceCaptureService provider gap retry (B1.2Y1.1)', () => {
  const originalGap = process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV];
  const originalGen = process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV];

  afterEach(() => {
    restoreProcessEnv(BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV, originalGap);
    restoreProcessEnv(BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV, originalGen);
  });

  it('TEST_RESOLUTION_RETRY_AFTER_GENERALIZED_DUPLICATE completes gap on second pass', async () => {
    process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV] = 'true';
    process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV] = 'true';

    const resolveCalls: string[] = [];
    const providerGap = {
      tryResolveAfterFreshLvObservation: jest
        .fn()
        .mockRejectedValueOnce(new Error('transient db'))
        .mockResolvedValueOnce('resolved'),
    };

    const observationRow = {
      id: randomUUID(),
      evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
      stateAlignmentClass: 'ALIGNED',
      voltageObservedAt: new Date('2026-09-22T10:00:00Z'),
      providerObservationAt: new Date('2026-09-22T10:00:00Z'),
    };

    const prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
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
        }),
      },
      batteryGeneralizedEvidenceObservation: {
        findFirst: jest.fn().mockResolvedValue(observationRow),
      },
    };

    const repository = {
      createObservationIdempotent: jest
        .fn()
        .mockResolvedValueOnce('created')
        .mockResolvedValueOnce('duplicate'),
      findActiveRestSession: jest.fn().mockResolvedValue(null),
    };

    const restSessions = {
      processObservation: jest.fn().mockResolvedValue('noop'),
    };
    const lateTripAssociation = {
      associatePendingSessions: jest.fn().mockResolvedValue(undefined),
    };
    const batteryPolicy = {
      resolveForVehicle: jest.fn().mockResolvedValue({ driveProfile: 'ICE' }),
    };

    const service = new GeneralizedEvidenceCaptureService(
      prisma as never,
      repository as never,
      batteryPolicy as never,
      restSessions as never,
      lateTripAssociation as never,
      providerGap as never,
    );

    const payload = {
      organizationId: 'org',
      vehicleId: 'veh',
      idempotencyKey: 'classify-key',
      snapshotContext: {
        lvBatteryVoltage: 12.3,
        providerFetchedAt: new Date().toISOString(),
        lvBatteryObservedAt: new Date('2026-09-22T10:00:00Z').toISOString(),
      },
    } as never;

    await service.captureFromObservationClassify(payload, 'meas-1', 'NEW_OBSERVATION');
    await service.captureFromObservationClassify(payload, 'meas-1', 'NEW_OBSERVATION');

    expect(providerGap.tryResolveAfterFreshLvObservation).toHaveBeenCalledTimes(2);
    expect(repository.createObservationIdempotent).toHaveBeenCalledTimes(2);
    expect(restSessions.processObservation).toHaveBeenCalledTimes(2);
    resolveCalls.push('done');
    expect(resolveCalls).toHaveLength(1);
  });
});
