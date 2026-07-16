import { BatteryMeasurementQuality } from '@prisma/client';
import { HvCapacityMethod } from '../battery-v2-domain';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { HvCapacityShadowService } from './hv-capacity-shadow.service';
import { HvCapacitySessionSummaryService } from './hv-capacity-session-summary.service';
import {
  TESLA_AUDIT_EXPECTED_MEDIAN_KWH,
  TESLA_AUDIT_M2_SESSION_4_SAMPLES,
  TESLA_AUDIT_MEDIAN_TOLERANCE_KWH,
  TESLA_AUDIT_REFERENCE_CAPACITY_KWH,
} from './hv-capacity-m2.fixtures';
import { HV_M2_CAPACITY_METHOD, HV_M2_MODEL_VERSION } from './hv-capacity-m2.types';

jest.mock('@config/battery-health-v2.config', () => ({
  isBatteryV2HvCapacityShadowEnabled: jest.fn().mockReturnValue(true),
}));

describe('HvCapacityShadowService', () => {
  const organizationId = 'org-1';
  const vehicleId = 'veh-1';
  const chargeSessionId = 'session-4';

  const prisma = {
    hvChargeSession: { findFirst: jest.fn() },
    vehicleBatteryReferenceCapacity: { findFirst: jest.fn() },
  };
  const sampleProvider = { loadSessionSamples: jest.fn() };
  const observations = {
    hasSessionObservations: jest.fn(),
    createIdempotent: jest.fn(),
  };

  const sessionSummary = { summarizeSession: jest.fn() };

  let service: HvCapacityShadowService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HvCapacityShadowService(
      prisma as any,
      sampleProvider as any,
      observations as any,
      sessionSummary as any,
    );

    prisma.hvChargeSession.findFirst.mockResolvedValue({
      id: chargeSessionId,
      organizationId,
      vehicleId,
      startAt: new Date('2026-06-21T19:00:08.000Z'),
      endAt: new Date('2026-06-22T05:36:49.000Z'),
      isOngoing: false,
      metadata: {
        capacityShadowEligible: true,
        qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
      },
    });
    prisma.vehicleBatteryReferenceCapacity.findFirst.mockResolvedValue({
      capacityKwh: TESLA_AUDIT_REFERENCE_CAPACITY_KWH,
    });
    observations.hasSessionObservations.mockResolvedValue(false);
    observations.createIdempotent.mockImplementation(async (input) => ({
      id: `obs-${input.observedAt.getTime()}`,
      ...input,
    }));
    sessionSummary.summarizeSession.mockResolvedValue({
      status: 'STABLE_SHADOW',
      shadowGatePassed: true,
      gateReasonCodes: [],
      stats: { medianCapacityKwh: 55.5, coefficientOfVariation: 0.002 },
    });
  });

  it('persists shadow observations for qualified session with audit samples', async () => {
    const result = await service.recomputeM2ForSession({
      organizationId,
      vehicleId,
      chargeSessionId,
      samplesOverride: TESLA_AUDIT_M2_SESSION_4_SAMPLES,
    });

    expect(result.persistedCount).toBeGreaterThan(0);
    expect(result.method).toBe(HV_M2_CAPACITY_METHOD);
    expect(result.modelVersion).toBe(HV_M2_MODEL_VERSION);
    expect(result.sessionMedianKwh).not.toBeNull();
    expect(result.sessionMedianKwh!).toBeGreaterThanOrEqual(
      TESLA_AUDIT_EXPECTED_MEDIAN_KWH - TESLA_AUDIT_MEDIAN_TOLERANCE_KWH,
    );
    expect(result.sessionMedianKwh!).toBeLessThanOrEqual(
      TESLA_AUDIT_EXPECTED_MEDIAN_KWH + TESLA_AUDIT_MEDIAN_TOLERANCE_KWH,
    );

    expect(observations.createIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({
        method: HvCapacityMethod.CURRENT_ENERGY_OVER_SOC,
        quality: BatteryMeasurementQuality.SHADOW,
        modelVersion: HV_M2_MODEL_VERSION,
        metadata: expect.objectContaining({
          shadowMode: true,
          socPercent: expect.any(Number),
          currentEnergyKwh: expect.any(Number),
          timestampDeltaMs: expect.any(Number),
        }),
      }),
    );

    expect(result.summary).not.toBeNull();
    expect(sessionSummary.summarizeSession).toHaveBeenCalled();
  });

  it('skips ineligible sessions', async () => {
    prisma.hvChargeSession.findFirst.mockResolvedValue({
      id: chargeSessionId,
      organizationId,
      vehicleId,
      startAt: new Date(),
      endAt: new Date(),
      isOngoing: false,
      metadata: {
        capacityShadowEligible: false,
        qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.ONGOING,
      },
    });

    const result = await service.recomputeM2ForSession({
      organizationId,
      vehicleId,
      chargeSessionId,
      samplesOverride: TESLA_AUDIT_M2_SESSION_4_SAMPLES,
    });

    expect(result.persistedCount).toBe(0);
    expect(observations.createIdempotent).not.toHaveBeenCalled();
  });

  it('aggregates summary when observations already processed', async () => {
    observations.hasSessionObservations.mockResolvedValue(true);

    const result = await service.recomputeM2ForSession({
      organizationId,
      vehicleId,
      chargeSessionId,
      samplesOverride: TESLA_AUDIT_M2_SESSION_4_SAMPLES,
    });

    expect(result.persistedCount).toBe(0);
    expect(observations.createIdempotent).not.toHaveBeenCalled();
    expect(sessionSummary.summarizeSession).toHaveBeenCalled();
    expect(result.summary).not.toBeNull();
  });
});
