import { DeviceConnectionPhysicalAuthorityMode } from '@prisma/client';
import { evaluatePhysicalStateCutoverEligibility } from './physical-state-authority-cutover.eligibility';
import { PhysicalStateCutoverEligibilityStatus } from './physical-state-authority-cutover.types';

const scope = {
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  provider: 'DIMO',
};

const provenEvidence = {
  targetPreseedDryRunProven: true,
  unexplainedDivergencesZeroProven: true,
  mixedReplicaGateProven: true,
  runtimeReady: true,
};

describe('physical-state-authority-cutover.eligibility', () => {
  it('defaults to blocked when activation evidence is absent', () => {
    const result = evaluatePhysicalStateCutoverEligibility({
      scope,
      currentAuthorityMode: DeviceConnectionPhysicalAuthorityMode.LEGACY,
      mixedReplicaInterlock: { safe: true, reason: 'SAFE', details: [] },
    });
    expect(result.status).toBe(
      PhysicalStateCutoverEligibilityStatus.BLOCKED_TARGET_PRESEED_NOT_PROVEN,
    );
  });

  it('returns ELIGIBLE when all gates are proven', () => {
    const result = evaluatePhysicalStateCutoverEligibility({
      scope,
      currentAuthorityMode: DeviceConnectionPhysicalAuthorityMode.LEGACY,
      activationEvidence: provenEvidence,
      mixedReplicaInterlock: { safe: true, reason: 'SAFE', details: [] },
    });
    expect(result.status).toBe(PhysicalStateCutoverEligibilityStatus.ELIGIBLE);
  });

  it('returns ALREADY_PHYSICAL without blocking', () => {
    const result = evaluatePhysicalStateCutoverEligibility({
      scope,
      currentAuthorityMode: DeviceConnectionPhysicalAuthorityMode.PHYSICAL,
      activationEvidence: {},
      mixedReplicaInterlock: { safe: false, reason: 'BLOCKED_MIXED_REPLICA', details: [] },
    });
    expect(result.status).toBe(PhysicalStateCutoverEligibilityStatus.ALREADY_PHYSICAL);
  });
});
