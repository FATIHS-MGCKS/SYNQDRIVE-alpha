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
  resolvePhysicalEffectiveState,
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
    ...overrides,
  };
}

describe('physical-state shadow comparator', () => {
  it('1. BOTH_ACCEPT same state / same timestamp -> MATCH', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        legacyEvidenceObservedAt: '2026-09-12T10:00:00.000Z',
        evidenceObservedAt: '2026-09-12T10:00:00.000Z',
      }),
    );
    expect(result.classification).toBe(PhysicalStateShadowClassification.MATCH);
    expect(result.correctnessBlocking).toBe(false);
  });

  it('2. BOTH_ACCEPT same state / different timestamp -> TIMESTAMP_DIVERGENCE', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        legacyEvidenceObservedAt: '2026-09-12T10:00:00.000Z',
        evidenceObservedAt: '2026-09-12T11:00:00.000Z',
      }),
    );
    expect(result.classification).toBe(PhysicalStateShadowClassification.TIMESTAMP_DIVERGENCE);
    expect(result.correctnessBlocking).toBe(false);
  });

  it('3. BOTH_ACCEPT different state / same timestamp -> STATE_DIVERGENCE_CORRECTNESS_UNKNOWN', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        legacyEffectivePlugState: 'plugged',
        physicalDecision: {
          accepted: true,
          reason: null,
          gate: PhysicalStateCanonicalGate.PHYSICAL,
          transitionDecision: DeviceConnectionPhysicalTransitionDecision.APPLIED,
          effectiveState: DeviceConnectionPhysicalEffectiveState.UNPLUGGED,
        },
        legacyEvidenceObservedAt: '2026-09-12T10:00:00.000Z',
        evidenceObservedAt: '2026-09-12T10:00:00.000Z',
      }),
    );
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.STATE_DIVERGENCE_CORRECTNESS_UNKNOWN,
    );
    expect(result.correctnessBlocking).toBe(true);
  });

  it('4. BOTH_ACCEPT different state / different timestamp -> STATE_DIVERGENCE (not TIMESTAMP)', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        legacyEffectivePlugState: 'plugged',
        physicalDecision: {
          accepted: true,
          reason: null,
          gate: PhysicalStateCanonicalGate.PHYSICAL,
          transitionDecision: DeviceConnectionPhysicalTransitionDecision.APPLIED,
          effectiveState: DeviceConnectionPhysicalEffectiveState.UNPLUGGED,
        },
        legacyEvidenceObservedAt: '2026-09-12T10:00:00.000Z',
        evidenceObservedAt: '2026-09-12T11:00:00.000Z',
      }),
    );
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.STATE_DIVERGENCE_CORRECTNESS_UNKNOWN,
    );
    expect(result.correctnessBlocking).toBe(true);
  });

  it('5. OLD_REJECT + NEW_ACCEPT without proof -> UNEXPLAINED_OLD_REJECT_NEW_ACCEPT', () => {
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
      }),
    );
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT,
    );
    expect(result.correctnessBlocking).toBe(true);
    expect(isGtR1ExpectedFixLegacyReason('no_state_change')).toBe(true);
  });

  it('6. OLD_REJECT + NEW_ACCEPT with explicit independent proof -> EXPECTED_FIX', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        provenExpectedFix: true,
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
        evidenceObservedAt: '2026-09-12T16:27:51.000Z',
      }),
    );
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
    );
    expect(result.correctnessBlocking).toBe(false);
  });

  it('6b. EXPECTED_FIX requires proof bit even for non-GT-R1 legacy reasons', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        provenExpectedFix: true,
        legacyDecision: {
          accepted: false,
          reason: 'some_other_reason',
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
      PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
    );
  });

  it('7. OLD_ACCEPT + expected physical rejection -> OLD_ACCEPT_NEW_REJECT_EXPECTED', () => {
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

  it('8. OLD_ACCEPT + unexplained physical rejection -> UNEXPLAINED_OLD_ACCEPT_NEW_REJECT', () => {
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

  it('9. BOTH_REJECT same reason -> MATCH', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        legacyDecision: {
          accepted: false,
          reason: 'reason_a',
          gate: PhysicalStateCanonicalGate.LEGACY,
        },
        physicalDecision: {
          accepted: false,
          reason: 'reason_a',
          gate: PhysicalStateCanonicalGate.PHYSICAL,
          transitionDecision: DeviceConnectionPhysicalTransitionDecision.STALE,
        },
      }),
    );
    expect(result.classification).toBe(PhysicalStateShadowClassification.MATCH);
    expect(result.correctnessBlocking).toBe(false);
  });

  it('10. BOTH_REJECT different reasons -> MATCH', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        legacyDecision: {
          accepted: false,
          reason: 'reason_a',
          gate: PhysicalStateCanonicalGate.LEGACY,
        },
        physicalDecision: {
          accepted: false,
          reason: 'reason_b',
          gate: PhysicalStateCanonicalGate.PHYSICAL,
          transitionDecision: DeviceConnectionPhysicalTransitionDecision.DUPLICATE,
        },
        legacyEvidenceObservedAt: '2026-09-12T10:00:00.000Z',
        evidenceObservedAt: '2026-09-12T10:00:00.000Z',
      }),
    );
    expect(result.classification).toBe(PhysicalStateShadowClassification.MATCH);
    expect(result.correctnessBlocking).toBe(false);
  });

  it('11. BOTH_REJECT different timestamps -> TIMESTAMP_DIVERGENCE', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        legacyDecision: {
          accepted: false,
          reason: 'reason_a',
          gate: PhysicalStateCanonicalGate.LEGACY,
        },
        physicalDecision: {
          accepted: false,
          reason: 'reason_b',
          gate: PhysicalStateCanonicalGate.PHYSICAL,
          transitionDecision: DeviceConnectionPhysicalTransitionDecision.STALE,
        },
        legacyEvidenceObservedAt: '2026-09-12T10:00:00.000Z',
        evidenceObservedAt: '2026-09-12T11:00:00.000Z',
      }),
    );
    expect(result.classification).toBe(PhysicalStateShadowClassification.TIMESTAMP_DIVERGENCE);
    expect(result.correctnessBlocking).toBe(false);
  });

  it('12. physicalDecision.effectiveState only / aligned -> MATCH', () => {
    const input = baseInput({
      legacyEffectivePlugState: 'plugged',
      physicalDecision: {
        accepted: true,
        reason: null,
        gate: PhysicalStateCanonicalGate.PHYSICAL,
        transitionDecision: DeviceConnectionPhysicalTransitionDecision.APPLIED,
        effectiveState: DeviceConnectionPhysicalEffectiveState.PLUGGED,
      },
    });
    expect(resolvePhysicalEffectiveState(input)).toBe(
      DeviceConnectionPhysicalEffectiveState.PLUGGED,
    );
    const result = comparePhysicalStateShadowDecisions(input);
    expect(result.classification).toBe(PhysicalStateShadowClassification.MATCH);
    expect(result.physicalEffectiveState).toBe(DeviceConnectionPhysicalEffectiveState.PLUGGED);
  });

  it('13. physicalDecision.effectiveState only / divergent -> STATE_DIVERGENCE', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        legacyEffectivePlugState: 'plugged',
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
      PhysicalStateShadowClassification.STATE_DIVERGENCE_CORRECTNESS_UNKNOWN,
    );
    expect(result.correctnessBlocking).toBe(true);
  });

  it('14. unexplained binding divergence -> blocker', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        legacyBindingKey: 'binding-a',
        physicalBindingKey: 'binding-b',
      }),
    );
    expect(result.classification).toBe(PhysicalStateShadowClassification.BINDING_DIVERGENCE);
    expect(result.correctnessBlocking).toBe(true);
  });

  it('14b. explicit null legacyBindingKey does not substitute bindingKey fallback', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        bindingKey: 'binding-b',
        legacyBindingKey: null,
        physicalBindingKey: 'binding-b',
        legacyDecision: {
          accepted: false,
          reason: 'no_open_episode',
          gate: PhysicalStateCanonicalGate.LEGACY,
        },
        physicalDecision: {
          accepted: true,
          reason: null,
          gate: PhysicalStateCanonicalGate.PHYSICAL,
          transitionDecision: DeviceConnectionPhysicalTransitionDecision.APPLIED,
          effectiveState: DeviceConnectionPhysicalEffectiveState.PLUGGED,
        },
        provenExpectedFix: false,
      }),
    );
    expect(result.classification).not.toBe(PhysicalStateShadowClassification.BINDING_DIVERGENCE);
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT,
    );
  });

  it('15. explained binding divergence -> non-blocking', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({
        legacyBindingKey: 'binding-a',
        physicalBindingKey: 'binding-b',
        bindingDivergenceExplained: true,
      }),
    );
    expect(result.classification).toBe(PhysicalStateShadowClassification.BINDING_DIVERGENCE);
    expect(result.correctnessBlocking).toBe(false);
  });

  it('16. equal-time opposing state -> CONFLICT', () => {
    const result = comparePhysicalStateShadowDecisions(
      baseInput({ equalTimeOpposingState: true }),
    );
    expect(result.classification).toBe(PhysicalStateShadowClassification.CONFLICT);
    expect(result.correctnessBlocking).toBe(false);
  });

  it('comparator has no persistence side effects', () => {
    const input = baseInput({
      provenExpectedFix: true,
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
