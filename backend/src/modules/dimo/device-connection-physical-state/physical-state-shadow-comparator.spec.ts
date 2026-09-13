import {
  DeviceConnectionPhysicalAuthorityMode,
  DeviceConnectionPhysicalEffectiveState,
  DeviceConnectionPhysicalTransitionDecision,
} from '@prisma/client';
import { PhysicalStateCanonicalGate } from './physical-state-authority.types';
import { PhysicalStateShadowClassification } from './physical-state-shadow.classification';
import {
  comparePhysicalStateShadowDecisions,
  isGtR1ExpectedFixLegacyReason,
} from './physical-state-shadow-comparator';
import type { PhysicalStateShadowComparisonInput } from './physical-state-shadow-comparator.types';

const scope = {
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  provider: 'DIMO',
};

function baseInput(
  overrides: Partial<PhysicalStateShadowComparisonInput> = {},
): PhysicalStateShadowComparisonInput {
  return {
    scope,
    bindingKey: 'binding-1',
    legacyDecision: {
      accepted: true,
      reason: null,
      gate: PhysicalStateCanonicalGate.LEGACY,
    },
    physicalDecision: {
      accepted: true,
      reason: null,
      gate: PhysicalStateCanonicalGate.PHYSICAL,
      transitionDecision: DeviceConnectionPhysicalTransitionDecision.APPLIED,
      effectiveState: DeviceConnectionPhysicalEffectiveState.PLUGGED,
    },
    legacyEffectivePlugState: 'plugged',
    physicalEffectiveState: DeviceConnectionPhysicalEffectiveState.PLUGGED,
    ...overrides,
  };
}

describe('physical-state shadow comparator', () => {
  it('K. shadow MATCH when both accept aligned states', () => {
    const result = comparePhysicalStateShadowDecisions(baseInput());
    expect(result.classification).toBe(PhysicalStateShadowClassification.MATCH);
    expect(result.correctnessBlocking).toBe(false);
  });

  it('L. EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT for GT-R1 stale last-event class', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        legacyDecision: {
          accepted: false,
          reason: 'no_state_change',
          gate: PhysicalStateCanonicalGate.LEGACY,
        },
        physicalDecision: {
          accepted: true,
          reason: null,
          gate: PhysicalStateCanonicalGate.PHYSICAL,
          transitionDecision: DeviceConnectionPhysicalTransitionDecision.APPLIED,
          effectiveState: DeviceConnectionPhysicalEffectiveState.UNPLUGGED,
        },
        legacyEffectivePlugState: 'plugged',
        physicalEffectiveState: DeviceConnectionPhysicalEffectiveState.UNPLUGGED,
        evidenceObservedAt: '2026-09-12T16:27:51.000Z',
      }),
    );
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
    );
    expect(result.correctnessBlocking).toBe(false);
    expect(isGtR1ExpectedFixLegacyReason('no_state_change')).toBe(true);
  });

  it('M. UNEXPLAINED_OLD_REJECT_NEW_ACCEPT is a correctness blocker', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        legacyDecision: {
          accepted: false,
          reason: 'custom_unknown_reject',
          gate: PhysicalStateCanonicalGate.LEGACY,
        },
        physicalDecision: {
          accepted: true,
          reason: null,
          gate: PhysicalStateCanonicalGate.PHYSICAL,
          transitionDecision: DeviceConnectionPhysicalTransitionDecision.APPLIED,
          effectiveState: DeviceConnectionPhysicalEffectiveState.UNPLUGGED,
        },
      }),
    );
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT,
    );
    expect(result.correctnessBlocking).toBe(true);
  });

  it('N. OLD_ACCEPT_NEW_REJECT_EXPECTED for stale physical rejection', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        legacyDecision: {
          accepted: true,
          reason: null,
          gate: PhysicalStateCanonicalGate.LEGACY,
        },
        physicalDecision: {
          accepted: false,
          reason: 'stale_evidence',
          gate: PhysicalStateCanonicalGate.PHYSICAL,
          transitionDecision: DeviceConnectionPhysicalTransitionDecision.STALE,
        },
      }),
    );
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.OLD_ACCEPT_NEW_REJECT_EXPECTED,
    );
    expect(result.correctnessBlocking).toBe(false);
  });

  it('O. UNEXPLAINED_OLD_ACCEPT_NEW_REJECT is a correctness blocker', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        legacyDecision: {
          accepted: true,
          reason: null,
          gate: PhysicalStateCanonicalGate.LEGACY,
        },
        physicalDecision: {
          accepted: false,
          reason: 'unexpected_reject',
          gate: PhysicalStateCanonicalGate.PHYSICAL,
          transitionDecision: DeviceConnectionPhysicalTransitionDecision.APPLIED,
        },
      }),
    );
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.UNEXPLAINED_OLD_ACCEPT_NEW_REJECT,
    );
    expect(result.correctnessBlocking).toBe(true);
  });

  it('P. STATE_DIVERGENCE_CORRECTNESS_UNKNOWN is a correctness blocker', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        legacyEffectivePlugState: 'plugged',
        physicalEffectiveState: DeviceConnectionPhysicalEffectiveState.UNPLUGGED,
      }),
    );
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.STATE_DIVERGENCE_CORRECTNESS_UNKNOWN,
    );
    expect(result.correctnessBlocking).toBe(true);
  });

  it('Q. BINDING_DIVERGENCE when binding keys differ', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        legacyBindingKey: 'binding-a',
        physicalBindingKey: 'binding-b',
      }),
    );
    expect(result.classification).toBe(PhysicalStateShadowClassification.BINDING_DIVERGENCE);
    expect(result.correctnessBlocking).toBe(true);
  });

  it('R. TIMESTAMP_DIVERGENCE when timestamps differ with same accept outcome', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        legacyEvidenceObservedAt: '2026-09-12T10:00:00.000Z',
        evidenceObservedAt: '2026-09-12T11:00:00.000Z',
      }),
    );
    expect(result.classification).toBe(PhysicalStateShadowClassification.TIMESTAMP_DIVERGENCE);
    expect(result.correctnessBlocking).toBe(false);
  });

  it('S. CONFLICT for equal-time opposing state signal', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({ equalTimeOpposingState: true }),
    );
    expect(result.classification).toBe(PhysicalStateShadowClassification.CONFLICT);
    expect(result.correctnessBlocking).toBe(false);
  });

  it('T. comparator has no persistence side effects', () => {
    const input = baseInput({
      legacyDecision: {
        accepted: false,
        reason: 'no_state_change',
        gate: PhysicalStateCanonicalGate.LEGACY,
      },
      physicalDecision: {
        accepted: true,
        gate: PhysicalStateCanonicalGate.PHYSICAL,
        transitionDecision: DeviceConnectionPhysicalTransitionDecision.APPLIED,
        effectiveState: DeviceConnectionPhysicalEffectiveState.UNPLUGGED,
      },
    });
    const result = comparePhysicalStateShadowDecisions(input);
    expect(result).toMatchObject({
      classification: PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
      scope,
    });
    expect((result as { prisma?: unknown }).prisma).toBeUndefined();
  });

  it('includes authority mode on comparison result', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({ authorityMode: DeviceConnectionPhysicalAuthorityMode.PHYSICAL }),
    );
    expect(result.authorityMode).toBe(DeviceConnectionPhysicalAuthorityMode.PHYSICAL);
  });
});
