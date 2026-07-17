import {
  BatteryAssessmentMaturity,
  BatteryAssessmentType,
  BatteryEvidenceScope,
} from '@prisma/client';
import { BatteryAssessmentRepository } from '../battery-assessment.repository';
import { HvCapacityCrossSessionAssessmentService } from './hv-capacity-cross-session-assessment.service';
import {
  TESLA_AUDIT_CROSS_SESSION_CONFLICTING_INPUT,
  TESLA_AUDIT_CROSS_SESSION_EXPECTED_CAPACITY_KWH,
  TESLA_AUDIT_CROSS_SESSION_STABLE_INPUT,
  TESLA_AUDIT_CROSS_SESSION_TOLERANCE_KWH,
  TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
} from './hv-capacity-cross-session.fixtures';
import { HV_CROSS_SESSION_SCORE_SEMANTICS } from './hv-capacity-cross-session.types';

jest.mock('@config/battery-health-v2.config', () => ({
  isBatteryV2HvCapacityShadowEnabled: jest.fn().mockReturnValue(true),
}));

describe('HvCapacityCrossSessionAssessmentService', () => {
  const organizationId = 'org-1';
  const vehicleId = 'veh-tesla-audit';

  const prisma = {
    vehicleBatteryReferenceCapacity: { findFirst: jest.fn() },
    vehicleBatteryCapability: { findUnique: jest.fn() },
    hvChargeSession: { findMany: jest.fn() },
  };
  const assessments = {
    findLatestHvCapacityShadow: jest.fn(),
    persistHvCapacityShadow: jest.fn(),
  };

  let service: HvCapacityCrossSessionAssessmentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HvCapacityCrossSessionAssessmentService(
      prisma as any,
      assessments as any,
    );

    prisma.vehicleBatteryReferenceCapacity.findFirst.mockResolvedValue({
      id: 'ref-cap-57',
      capacityKwh: 57,
    });
    prisma.vehicleBatteryCapability.findUnique.mockResolvedValue({
      capabilityVersion: 3,
    });
    assessments.findLatestHvCapacityShadow.mockResolvedValue(null);
    assessments.persistHvCapacityShadow.mockImplementation(async (input) => ({
      id: 'assess-1',
      ...input.assessment,
      scope: BatteryEvidenceScope.HV,
      type: BatteryAssessmentType.HV_CAPACITY_SHADOW,
      maturity: BatteryAssessmentMaturity.LOW,
    }));
  });

  it('persists cross-session shadow assessment for four stable Tesla sessions', async () => {
    const result = await service.recomputeForVehicle({
      organizationId,
      vehicleId,
      sessionsOverride: TESLA_AUDIT_CROSS_SESSION_STABLE_INPUT,
      contextOverride: TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
    });

    expect(result).not.toBeNull();
    expect(result!.persisted).toBe(true);
    expect(result!.assessment.shadowGatePassed).toBe(true);
    expect(result!.assessment.estimatedUsableCapacityKwh).toBeGreaterThanOrEqual(
      TESLA_AUDIT_CROSS_SESSION_EXPECTED_CAPACITY_KWH -
        TESLA_AUDIT_CROSS_SESSION_TOLERANCE_KWH,
    );

    expect(assessments.persistHvCapacityShadow).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        vehicleId,
        assessment: expect.objectContaining({
          scoreSemantics: HV_CROSS_SESSION_SCORE_SEMANTICS,
          publicationEligible: false,
          sohEligible: false,
          sessionCount: 4,
        }),
      }),
    );
  });

  it('persists insufficient assessment without usable capacity for conflicting sessions', async () => {
    const result = await service.recomputeForVehicle({
      organizationId,
      vehicleId,
      sessionsOverride: TESLA_AUDIT_CROSS_SESSION_CONFLICTING_INPUT,
      contextOverride: TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
    });

    expect(result!.persisted).toBe(true);
    expect(result!.assessment.shadowGatePassed).toBe(false);
    expect(result!.assessment.estimatedUsableCapacityKwh).toBeNull();
    expect(assessments.persistHvCapacityShadow).toHaveBeenCalled();
  });

  it('skips persist when idempotency key unchanged', async () => {
    const first = await service.recomputeForVehicle({
      organizationId,
      vehicleId,
      sessionsOverride: TESLA_AUDIT_CROSS_SESSION_STABLE_INPUT,
      contextOverride: TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
    });

    assessments.findLatestHvCapacityShadow.mockResolvedValue({
      id: 'assess-1',
      idempotencyKey: first!.assessment.idempotencyKey,
    });

    const second = await service.recomputeForVehicle({
      organizationId,
      vehicleId,
      sessionsOverride: TESLA_AUDIT_CROSS_SESSION_STABLE_INPUT,
      contextOverride: TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
    });

    expect(second!.persisted).toBe(false);
    expect(assessments.persistHvCapacityShadow).toHaveBeenCalledTimes(1);
  });
});
