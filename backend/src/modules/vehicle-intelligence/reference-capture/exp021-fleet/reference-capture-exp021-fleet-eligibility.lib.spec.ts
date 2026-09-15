import { Exp021StudyStatus } from '@prisma/client';
import { evaluateExp021FleetEligibility, isStudyStatusEligibleForCollection } from './reference-capture-exp021-fleet-eligibility.lib';
import { EXP021_SHORT_AB_PLAN_REGISTRY_KEYS } from './reference-capture-exp021-fleet-order-allocator.lib';

describe('reference-capture-exp021-fleet-eligibility.lib', () => {
  const baseInput = {
    studyStatus: Exp021StudyStatus.COLLECTING,
    enrollmentEnabled: true,
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    enrolledTokenId: 123,
    resolvedTokenId: 123,
    allowedPlans: [
      EXP021_SHORT_AB_PLAN_REGISTRY_KEYS.ORDER_90_60,
      EXP021_SHORT_AB_PLAN_REGISTRY_KEYS.ORDER_60_90,
    ],
    hfPolicyAllowed: true,
    activeSessionConflict: false,
    telemetryFreshness: 'FRESH' as const,
    referenceCaptureEnabled: true,
    fleetCoordinatorEnabled: true,
    fleetDryRun: true,
  };

  it('passes allowlist gate for enabled enrolled vehicle', () => {
    const result = evaluateExp021FleetEligibility(baseInput, { globalCounts: {}, vehicleCounts: {} });
    expect(result.eligible).toBe(true);
    expect(result.proposedPlanId).toBe('candidate_short_ab_60_90');
  });

  it('fails when study status is not COLLECTING', () => {
    const result = evaluateExp021FleetEligibility(
      { ...baseInput, studyStatus: Exp021StudyStatus.PAUSED },
      { globalCounts: {}, vehicleCounts: {} },
    );
    expect(result.reasonCodes).toContain('STUDY_NOT_COLLECTING');
  });

  it('fails when enrollment is disabled', () => {
    const result = evaluateExp021FleetEligibility(
      { ...baseInput, enrollmentEnabled: false },
      { globalCounts: {}, vehicleCounts: {} },
    );
    expect(result.reasonCodes).toContain('ENROLLMENT_DISABLED');
  });

  it('fails HF policy gate', () => {
    const result = evaluateExp021FleetEligibility(
      { ...baseInput, hfPolicyAllowed: false },
      { globalCounts: {}, vehicleCounts: {} },
    );
    expect(result.reasonCodes).toContain('HF_POLICY_BLOCKED');
  });

  it('fails active session conflict', () => {
    const result = evaluateExp021FleetEligibility(
      { ...baseInput, activeSessionConflict: true },
      { globalCounts: {}, vehicleCounts: {} },
    );
    expect(result.reasonCodes).toContain('ACTIVE_SESSION_CONFLICT');
  });

  it('fails telemetry unavailable', () => {
    const result = evaluateExp021FleetEligibility(
      { ...baseInput, telemetryFreshness: 'UNAVAILABLE' },
      { globalCounts: {}, vehicleCounts: {} },
    );
    expect(result.reasonCodes).toContain('TELEMETRY_UNAVAILABLE');
  });

  it('isStudyStatusEligibleForCollection only allows COLLECTING', () => {
    expect(isStudyStatusEligibleForCollection(Exp021StudyStatus.COLLECTING)).toBe(true);
    expect(isStudyStatusEligibleForCollection(Exp021StudyStatus.PAUSED)).toBe(false);
  });
});
