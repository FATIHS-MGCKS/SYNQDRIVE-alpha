import { BatteryMeasurementQuality } from '@prisma/client';
import { HvCapacityMethod } from '../battery-v2-domain';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import {
  TESLA_AUDIT_M2_MEDIAN_FOR_CONFLICT_KWH,
  TESLA_AUDIT_M3_CAPACITY_TOLERANCE_KWH,
  TESLA_AUDIT_M3_IMPLAUSIBLE_SEGMENT_INPUT,
  TESLA_AUDIT_M3_SESSION_4_EXPECTED_CAPACITY_KWH,
  TESLA_AUDIT_M3_SESSION_4_INPUT,
} from './hv-capacity-m3.fixtures';
import { HvCapacityM3ValidationService } from './hv-capacity-m3-validation.service';
import {
  HV_M3_CAPACITY_METHOD,
  HV_M3_GATE_REASONS,
  HV_M3_MODEL_VERSION,
} from './hv-capacity-m3.types';

jest.mock('@config/battery-health-v2.config', () => ({
  isBatteryV2HvCapacityShadowEnabled: jest.fn().mockReturnValue(true),
}));

describe('HvCapacityM3ValidationService', () => {
  const organizationId = 'org-1';
  const vehicleId = 'veh-1';
  const chargeSessionId = 'session-4';

  const prisma = {
    hvChargeSession: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const observations = {
    hasSessionObservations: jest.fn(),
    createIdempotent: jest.fn(),
  };

  let service: HvCapacityM3ValidationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HvCapacityM3ValidationService(prisma as any, observations as any);

    prisma.hvChargeSession.findFirst.mockResolvedValue({
      id: chargeSessionId,
      organizationId,
      vehicleId,
      source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
      isOngoing: false,
      startAt: TESLA_AUDIT_M3_SESSION_4_INPUT.startAt,
      endAt: TESLA_AUDIT_M3_SESSION_4_INPUT.endAt,
      startSocPercent: TESLA_AUDIT_M3_SESSION_4_INPUT.startSocPercent,
      endSocPercent: TESLA_AUDIT_M3_SESSION_4_INPUT.endSocPercent,
      startEnergyKwh: TESLA_AUDIT_M3_SESSION_4_INPUT.startEnergyKwh,
      endEnergyKwh: TESLA_AUDIT_M3_SESSION_4_INPUT.endEnergyKwh,
      energyAddedKwh: TESLA_AUDIT_M3_SESSION_4_INPUT.energyAddedKwh,
      deltaSocPercent: TESLA_AUDIT_M3_SESSION_4_INPUT.deltaSocPercent,
      metadata: {
        capacityValidationEligible: true,
        qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
      },
    });
    observations.hasSessionObservations.mockResolvedValue(false);
    observations.createIdempotent.mockImplementation(async (input) => ({
      id: 'obs-m3',
      ...input,
    }));
    prisma.hvChargeSession.update.mockResolvedValue({});
  });

  it('persists plausible ~55 kWh M3 validation observation', async () => {
    const result = await service.validateSession({
      organizationId,
      vehicleId,
      chargeSessionId,
      m2MedianCapacityKwh: TESLA_AUDIT_M2_MEDIAN_FOR_CONFLICT_KWH,
    });

    expect(result.persisted).toBe(true);
    expect(result.method).toBe(HV_M3_CAPACITY_METHOD);
    expect(result.modelVersion).toBe(HV_M3_MODEL_VERSION);
    expect(result.estimate).not.toBeNull();
    expect(result.estimate!.estimatedCapacityKwh).toBeGreaterThanOrEqual(
      TESLA_AUDIT_M3_SESSION_4_EXPECTED_CAPACITY_KWH -
        TESLA_AUDIT_M3_CAPACITY_TOLERANCE_KWH,
    );
    expect(result.estimate!.methodConflict).toBe(false);

    expect(observations.createIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({
        method: HvCapacityMethod.SEGMENT_ADDED_ENERGY_OVER_SOC,
        quality: BatteryMeasurementQuality.VALID_PROXY,
        modelVersion: HV_M3_MODEL_VERSION,
        deltaSocPercent: TESLA_AUDIT_M3_SESSION_4_INPUT.deltaSocPercent,
        deltaEnergyKwh: TESLA_AUDIT_M3_SESSION_4_INPUT.energyAddedKwh,
        idempotencyKey: `hv-cap-m3:${chargeSessionId}:m${HV_M3_MODEL_VERSION}`,
        metadata: expect.objectContaining({
          validationOnly: true,
          segmentAggregateSource: true,
          methodConflict: false,
        }),
      }),
    );

    expect(prisma.hvChargeSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: chargeSessionId },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            m3Validation: expect.objectContaining({
              persisted: true,
              methodConflict: false,
            }),
          }),
        }),
      }),
    );
  });

  it('persists method conflict for implausible ~71 kWh segment aggregate', async () => {
    const result = await service.validateSession({
      organizationId,
      vehicleId,
      chargeSessionId,
      m2MedianCapacityKwh: TESLA_AUDIT_M2_MEDIAN_FOR_CONFLICT_KWH,
      sessionOverride: TESLA_AUDIT_M3_IMPLAUSIBLE_SEGMENT_INPUT,
    });

    expect(result.persisted).toBe(true);
    expect(result.estimate!.methodConflict).toBe(true);
    expect(result.estimate!.gate.reasonCodes).toContain(
      HV_M3_GATE_REASONS.METHOD_CONFLICT_WITH_M2,
    );

    expect(observations.createIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({
        quality: BatteryMeasurementQuality.INSUFFICIENT_COVERAGE,
        metadata: expect.objectContaining({
          methodConflict: true,
        }),
      }),
    );
  });

  it('skips when session observations already exist', async () => {
    observations.hasSessionObservations.mockResolvedValue(true);

    const result = await service.validateSession({
      organizationId,
      vehicleId,
      chargeSessionId,
      m2MedianCapacityKwh: TESLA_AUDIT_M2_MEDIAN_FOR_CONFLICT_KWH,
    });

    expect(result.persisted).toBe(false);
    expect(result.skippedReason).toBe('already_processed');
    expect(observations.createIdempotent).not.toHaveBeenCalled();
  });
});
