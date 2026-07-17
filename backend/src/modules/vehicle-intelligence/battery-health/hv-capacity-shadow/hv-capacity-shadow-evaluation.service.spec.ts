import { NotFoundException } from '@nestjs/common';
import {
  BatteryAssessmentMaturity,
  BatteryAssessmentType,
  BatteryEvidenceScope,
  BatteryMeasurementQuality,
} from '@prisma/client';
import { ReferenceCapacityVerificationStatus } from '../battery-v2-domain';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { HvCapacityShadowEvaluationService } from './hv-capacity-shadow-evaluation.service';
import { HV_M2_CAPACITY_METHOD } from './hv-capacity-m2.types';

jest.mock('@config/battery-health-v2.config', () => ({
  isBatteryV2HvSohPublicationEnabled: jest.fn().mockReturnValue(false),
}));

describe('HvCapacityShadowEvaluationService', () => {
  const organizationId = 'org-1';
  const otherOrgId = 'org-2';
  const vehicleId = 'veh-tesla-audit';
  const now = new Date('2026-06-28T12:00:00.000Z');

  const prisma = {
    vehicle: { findFirst: jest.fn() },
    vehicleBatteryReferenceCapacity: { findFirst: jest.fn() },
    hvChargeSession: { findMany: jest.fn() },
    hvCapacityObservation: { findMany: jest.fn() },
  };
  const assessments = {
    findLatestHvCapacityShadow: jest.fn(),
    findLatestHvSohGateAssessment: jest.fn(),
  };
  const methodProfile = { resolveForVehicle: jest.fn() };

  let service: HvCapacityShadowEvaluationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HvCapacityShadowEvaluationService(
      prisma as any,
      assessments as any,
      methodProfile as any,
    );

    prisma.vehicle.findFirst.mockResolvedValue({
      id: vehicleId,
      organizationId,
    });
    methodProfile.resolveForVehicle.mockResolvedValue({
      resolverVersion: '1.0.0',
      vehicleId,
      resolvedAt: now.toISOString(),
      socAvailable: true,
      currentEnergyAvailable: true,
      addedEnergyAvailable: true,
      rechargeSegmentsAvailable: true,
      isChargingAvailable: true,
      chargingCableConnectedAvailable: true,
      providerSohAvailable: false,
      grossCapacityAvailable: false,
      packTemperatureAvailable: true,
      chargingPowerAvailable: true,
      currentPowerAvailable: true,
      supportedCapacityMethods: ['M2_CURRENT_ENERGY_SOC', 'M3_ADDED_ENERGY_DELTA_SOC'],
      unsupportedReasons: [],
      lastCheckedAt: now.toISOString(),
      dataQuality: { status: 'SHADOW', labelDe: 'Shadow' },
    });
    prisma.vehicleBatteryReferenceCapacity.findFirst.mockResolvedValue({
      id: 'ref-57',
      capacityKwh: 57,
      capacityType: 'USABLE_NET',
      source: 'VERIFIED_VEHICLE_SPEC',
      verificationStatus: ReferenceCapacityVerificationStatus.UNVERIFIED,
      verifiedAt: null,
      isActive: true,
    });
    assessments.findLatestHvCapacityShadow.mockResolvedValue({
      id: 'cross-1',
      scoreValue: 55.54,
      confidence: 'HIGH',
      modelVersion: 1,
      computedAt: new Date('2026-06-27T10:00:00.000Z'),
      inputSummary: {
        sessionCount: 4,
        observationCount: 32,
        confidence: 'HIGH',
        maturity: 'SHADOW',
        shadowGatePassed: true,
        gateReasonCodes: [],
        spread: { coefficientOfVariation: 0.01 },
        methodAgreement: { sessionsWithM3Conflict: 0 },
        capabilityVersion: 3,
      },
    });
    assessments.findLatestHvSohGateAssessment.mockResolvedValue({
      id: 'soh-1',
      scoreValue: null,
      confidence: 'INSUFFICIENT',
      modelVersion: 1,
      computedAt: new Date('2026-06-27T10:00:00.000Z'),
      inputSummary: {
        sohAvailability: 'GATED',
        estimatedUsableCapacityKwh: 55.54,
        verifiedReferenceCapacityKwh: null,
        maturity: null,
        confidence: 'INSUFFICIENT',
        sohGatePassed: false,
        gateReasonCodes: ['REFERENCE_NOT_VERIFIED', 'PUBLICATION_DISABLED'],
        sohPublicationEnabled: false,
      },
    });
    prisma.hvChargeSession.findMany.mockResolvedValue([
      {
        id: 'session-1',
        organizationId,
        vehicleId,
        source: 'DIMO_RECHARGE_SEGMENT',
        startAt: new Date('2026-06-26T05:00:00.000Z'),
        endAt: new Date('2026-06-26T05:47:57.000Z'),
        isOngoing: false,
        deltaSocPercent: 27.4,
        energyAddedKwh: 15.1,
        metadata: {
          qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
          qualityReasonCodes: [],
          capacityShadowEligible: true,
          capacityValidationEligible: true,
          dimoTokenId: 424242,
          providerSegmentId: 'raw-provider-segment',
          m2CapacitySummary: {
            method: HV_M2_CAPACITY_METHOD,
            gateVersion: 1,
            modelVersion: 1,
            computedAt: now.toISOString(),
            status: 'STABLE_SHADOW',
            shadowGatePassed: true,
            gateReasonCodes: [],
            stats: {
              validSampleCount: 8,
              totalSampleCount: 8,
              outlierCount: 0,
              medianCapacityKwh: 55.52,
              p10CapacityKwh: 55.4,
              p90CapacityKwh: 55.6,
              madKwh: 0.04,
              robustSpreadKwh: 0.06,
              coefficientOfVariation: 0.002,
              minSocPercent: 40,
              maxSocPercent: 67,
              preferredBandSampleCount: 6,
              socSpanPercent: 27,
              temporalCoverageRatio: 0.9,
              temporalSpanMs: 2_800_000,
              providerGapCount: 0,
              maxProviderGapMs: null,
              dominantDuplicateRatio: 0,
            },
          },
          m3Validation: {
            method: 'SEGMENT_ADDED_ENERGY_OVER_SOC',
            modelVersion: 1,
            methodRole: 'VALIDATION_ONLY',
            estimatedCapacityKwh: 55.5,
            segmentAddedEnergyKwh: 15,
            deltaSocPercent: 27.4,
            gateEligible: true,
            gateReasonCodes: [],
            methodConflict: false,
            methodConflictDeviationRatio: null,
            m2MedianCapacityKwh: 55.52,
            persisted: true,
            validatedAt: now.toISOString(),
          },
        },
      },
    ]);
    prisma.hvCapacityObservation.findMany.mockResolvedValue([
      {
        id: 'obs-1',
        chargeSessionId: 'session-1',
        observedAt: new Date('2026-06-26T05:10:00.000Z'),
        estimatedCapacityKwh: 55.5,
        quality: BatteryMeasurementQuality.SHADOW,
        modelVersion: 1,
        metadata: {
          socPercent: 45,
          preferredSocBand: true,
          outlier: false,
        },
      },
    ]);
  });

  it('assembles internal shadow evaluation read model', async () => {
    const result = await service.getEvaluation({
      organizationId,
      vehicleId,
      now,
    });

    expect(result.organizationId).toBe(organizationId);
    expect(result.vehicleId).toBe(vehicleId);
    expect(result.publicationEligible).toBe(false);
    expect(result.readinessEffect).toBe(false);
    expect(result.capabilityProfile.rechargeSegmentsAvailable).toBe(true);
    expect(result.referenceCapacity?.verificationStatus).toBe(
      ReferenceCapacityVerificationStatus.UNVERIFIED,
    );
    expect(result.rechargeSessions).toHaveLength(1);
    expect(result.rechargeSessions[0].sessionMedianKwh).toBe(55.52);
    expect(result.rechargeSessions[0].m2Observations).toHaveLength(1);
    expect(result.crossSessionAssessment?.shadowGatePassed).toBe(true);
    expect(result.sohGate?.gateReasonCodes).toContain('REFERENCE_NOT_VERIFIED');
    expect(result.publicationBlockers.length).toBeGreaterThan(0);
    expect(result.freshness.crossSessionFresh).toBe(true);
  });

  it('enforces tenant separation — vehicle in other org is not found', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);

    await expect(
      service.getEvaluation({
        organizationId: otherOrgId,
        vehicleId,
        now,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.hvChargeSession.findMany).not.toHaveBeenCalled();
  });

  it('scopes charge sessions and observations to organization + vehicle', async () => {
    await service.getEvaluation({ organizationId, vehicleId, now });

    expect(prisma.hvChargeSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId,
          vehicleId,
        },
      }),
    );
    expect(prisma.hvCapacityObservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId,
          vehicleId,
        }),
      }),
    );
  });

  it('does not expose raw DIMO token or provider segment id in response', async () => {
    const result = await service.getEvaluation({
      organizationId,
      vehicleId,
      now,
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('dimoTokenId');
    expect(serialized).not.toContain('424242');
    expect(serialized).not.toContain('providerSegmentId');
    expect(serialized).not.toContain('raw-provider-segment');
  });

  it('loads assessments with tenant-scoped repository calls', async () => {
    await service.getEvaluation({ organizationId, vehicleId, now });

    expect(assessments.findLatestHvCapacityShadow).toHaveBeenCalledWith({
      organizationId,
      vehicleId,
    });
    expect(assessments.findLatestHvSohGateAssessment).toHaveBeenCalledWith({
      organizationId,
      vehicleId,
    });
  });
});
