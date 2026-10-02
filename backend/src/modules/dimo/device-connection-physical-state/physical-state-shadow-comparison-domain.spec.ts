import { DeviceConnectionPhysicalTransitionDecision } from '@prisma/client';
import { PhysicalStateCanonicalGate } from './physical-state-authority.types';
import { inferPhysicalStateShadowComparisonDomain } from './physical-state-shadow-comparison-domain';

describe('physical-state-shadow-comparison-domain', () => {
  it('classifies PROVENANCE_REFRESH as same-state provenance refresh domain', () => {
    expect(
      inferPhysicalStateShadowComparisonDomain({
        scope: { organizationId: 'o', vehicleId: 'v', provider: 'DIMO' },
        legacyDecision: {
          accepted: false,
          reason: 'no_open_episode',
          gate: PhysicalStateCanonicalGate.LEGACY,
        },
        physicalDecision: {
          accepted: true,
          gate: PhysicalStateCanonicalGate.PHYSICAL,
          transitionDecision: DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH,
          effectiveState: 'PLUGGED',
        },
      }),
    ).toBe('SAME_STATE_PROVENANCE_REFRESH');
  });
});
