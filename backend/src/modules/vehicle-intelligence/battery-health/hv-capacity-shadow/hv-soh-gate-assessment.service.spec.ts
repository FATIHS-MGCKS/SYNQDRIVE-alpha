import { HvSohGateAssessmentService } from './hv-soh-gate-assessment.service';
import {
  TESLA_AUDIT_SOH_GATE_CONTEXT,
  TESLA_AUDIT_STABLE_CROSS_SESSION,
  TESLA_AUDIT_VERIFIED_REFERENCE,
} from './hv-soh-gate.fixtures';
import { HV_SOH_GATE_AVAILABILITY } from './hv-soh-gate.types';

jest.mock('@config/battery-health-v2.config', () => ({
  isBatteryV2HvCapacityShadowEnabled: jest.fn().mockReturnValue(true),
  isBatteryV2HvSohPublicationEnabled: jest.fn().mockReturnValue(false),
}));

describe('HvSohGateAssessmentService', () => {
  const organizationId = 'org-1';
  const vehicleId = 'veh-tesla-audit';

  const prisma = {
    vehicleBatteryReferenceCapacity: { findFirst: jest.fn() },
    vehicleBatteryCapability: { findUnique: jest.fn() },
  };
  const assessments = {
    findLatestHvSohGateAssessment: jest.fn(),
    persistHvSohGateAssessment: jest.fn(),
  };

  let service: HvSohGateAssessmentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HvSohGateAssessmentService(prisma as any, assessments as any);
    prisma.vehicleBatteryCapability.findUnique.mockResolvedValue({
      capabilityVersion: TESLA_AUDIT_SOH_GATE_CONTEXT.currentCapabilityVersion,
    });
    assessments.findLatestHvSohGateAssessment.mockResolvedValue(null);
    assessments.persistHvSohGateAssessment.mockImplementation(async (input) => ({
      id: 'soh-assessment-1',
      ...input.assessment,
    }));
  });

  it('persists internal SOH gate assessment when cross-session input is provided', async () => {
    const result = await service.recomputeForVehicle({
      organizationId,
      vehicleId,
      crossSessionAssessment: {
        ...TESLA_AUDIT_STABLE_CROSS_SESSION,
        inputSummary: {
          ...TESLA_AUDIT_STABLE_CROSS_SESSION.inputSummary,
          capabilityVersion: TESLA_AUDIT_SOH_GATE_CONTEXT.currentCapabilityVersion,
        },
      },
      referenceOverride: TESLA_AUDIT_VERIFIED_REFERENCE,
      now: TESLA_AUDIT_SOH_GATE_CONTEXT.now,
    });

    expect(result?.persisted).toBe(true);
    expect(result?.assessment.sohAvailability).toBe(
      HV_SOH_GATE_AVAILABILITY.COMPUTED_INTERNAL,
    );
    expect(result?.assessment.estimatedSohPercent).not.toBeNull();
    expect(assessments.persistHvSohGateAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        vehicleId,
        assessment: expect.objectContaining({
          assessmentType: 'HV_SOH_CAPACITY_ESTIMATE',
          publicationEligible: false,
          sohPublicationEnabled: false,
        }),
      }),
    );
  });

  it('skips persistence when idempotency key is unchanged', async () => {
    const first = await service.recomputeForVehicle({
      organizationId,
      vehicleId,
      crossSessionAssessment: {
        ...TESLA_AUDIT_STABLE_CROSS_SESSION,
        inputSummary: {
          ...TESLA_AUDIT_STABLE_CROSS_SESSION.inputSummary,
          capabilityVersion: TESLA_AUDIT_SOH_GATE_CONTEXT.currentCapabilityVersion,
        },
      },
      referenceOverride: TESLA_AUDIT_VERIFIED_REFERENCE,
      now: TESLA_AUDIT_SOH_GATE_CONTEXT.now,
    });

    assessments.findLatestHvSohGateAssessment.mockResolvedValue({
      id: 'soh-assessment-1',
      idempotencyKey: first?.assessment.idempotencyKey,
    });

    const second = await service.recomputeForVehicle({
      organizationId,
      vehicleId,
      crossSessionAssessment: {
        ...TESLA_AUDIT_STABLE_CROSS_SESSION,
        inputSummary: {
          ...TESLA_AUDIT_STABLE_CROSS_SESSION.inputSummary,
          capabilityVersion: TESLA_AUDIT_SOH_GATE_CONTEXT.currentCapabilityVersion,
        },
      },
      referenceOverride: TESLA_AUDIT_VERIFIED_REFERENCE,
      now: TESLA_AUDIT_SOH_GATE_CONTEXT.now,
    });

    expect(second?.persisted).toBe(false);
    expect(assessments.persistHvSohGateAssessment).toHaveBeenCalledTimes(1);
  });
});
