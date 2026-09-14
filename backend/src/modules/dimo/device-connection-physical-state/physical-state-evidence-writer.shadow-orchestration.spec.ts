import { comparePhysicalStateShadowDecisions } from './physical-state-shadow-comparator';
import { PhysicalStateShadowClassification } from './physical-state-shadow.classification';
import { isProvenExpectedFix } from './physical-state-gt-r1-proof';
import { PhysicalStateCanonicalGate } from './physical-state-authority.types';

const scope = { organizationId: 'org', vehicleId: 'veh', provider: 'DIMO' };

function compare(input: {
  legacyAccepted: boolean;
  legacyPlugState: 'plugged' | 'unplugged' | 'unknown' | null;
  legacyTs: string | null;
  legacyBinding?: string;
  physicalAccepted: boolean;
  physicalState: 'PLUGGED' | 'UNPLUGGED' | null;
  physicalTs: string;
  physicalBinding?: string;
  provenExpectedFix?: boolean;
  equalTimeOpposingState?: boolean;
}) {
  return comparePhysicalStateShadowDecisions({
    scope,
    legacyDecision: {
      accepted: input.legacyAccepted,
      gate: PhysicalStateCanonicalGate.LEGACY,
    },
    physicalDecision: {
      accepted: input.physicalAccepted,
      gate: PhysicalStateCanonicalGate.PHYSICAL,
      effectiveState: input.physicalState,
    },
    legacyEffectivePlugState: input.legacyPlugState,
    legacyEvidenceObservedAt: input.legacyTs,
    evidenceObservedAt: input.physicalTs,
    legacyBindingKey: input.legacyBinding ?? 'binding-a',
    physicalBindingKey: input.physicalBinding ?? 'binding-a',
    bindingKey: 'binding-a',
    provenExpectedFix: input.provenExpectedFix,
    equalTimeOpposingState: input.equalTimeOpposingState,
  });
}

describe('physical-state-evidence-writer shadow orchestration', () => {
  it('BOTH_ACCEPT same state/same timestamp => MATCH', () => {
    const result = compare({
      legacyAccepted: true,
      legacyPlugState: 'plugged',
      legacyTs: '2026-09-12T15:00:00.000Z',
      physicalAccepted: true,
      physicalState: 'PLUGGED',
      physicalTs: '2026-09-12T15:00:00.000Z',
    });
    expect(result.classification).toBe(PhysicalStateShadowClassification.MATCH);
  });

  it('BOTH_ACCEPT same state/different timestamp => TIMESTAMP_DIVERGENCE', () => {
    const result = compare({
      legacyAccepted: true,
      legacyPlugState: 'plugged',
      legacyTs: '2026-09-12T15:00:00.000Z',
      physicalAccepted: true,
      physicalState: 'PLUGGED',
      physicalTs: '2026-09-12T16:00:00.000Z',
    });
    expect(result.classification).toBe(PhysicalStateShadowClassification.TIMESTAMP_DIVERGENCE);
  });

  it('BOTH_ACCEPT different state/same timestamp => STATE_DIVERGENCE_CORRECTNESS_UNKNOWN', () => {
    const result = compare({
      legacyAccepted: true,
      legacyPlugState: 'plugged',
      legacyTs: '2026-09-12T15:00:00.000Z',
      physicalAccepted: true,
      physicalState: 'UNPLUGGED',
      physicalTs: '2026-09-12T15:00:00.000Z',
    });
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.STATE_DIVERGENCE_CORRECTNESS_UNKNOWN,
    );
  });

  it('BOTH_ACCEPT different state/different timestamp => STATE_DIVERGENCE wins over timestamp', () => {
    const result = compare({
      legacyAccepted: true,
      legacyPlugState: 'unplugged',
      legacyTs: '2026-09-12T14:00:00.000Z',
      physicalAccepted: true,
      physicalState: 'PLUGGED',
      physicalTs: '2026-09-12T16:00:00.000Z',
    });
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.STATE_DIVERGENCE_CORRECTNESS_UNKNOWN,
    );
  });

  it('mismatched bindings => BINDING_DIVERGENCE', () => {
    const result = compare({
      legacyAccepted: true,
      legacyPlugState: 'plugged',
      legacyTs: '2026-09-12T15:00:00.000Z',
      legacyBinding: 'binding-legacy',
      physicalAccepted: true,
      physicalState: 'PLUGGED',
      physicalTs: '2026-09-12T15:00:00.000Z',
      physicalBinding: 'binding-physical',
    });
    expect(result.classification).toBe(PhysicalStateShadowClassification.BINDING_DIVERGENCE);
  });

  it('synthetic legacy state cannot hide divergent BOTH_ACCEPT pair', () => {
    const result = compare({
      legacyAccepted: true,
      legacyPlugState: 'plugged',
      legacyTs: '2026-09-12T15:00:00.000Z',
      physicalAccepted: true,
      physicalState: 'UNPLUGGED',
      physicalTs: '2026-09-12T15:00:00.000Z',
    });
    expect(result.classification).not.toBe(PhysicalStateShadowClassification.MATCH);
  });

  it('OLD_REJECT + NEW_ACCEPT without proof => UNEXPLAINED', () => {
    const result = compare({
      legacyAccepted: false,
      legacyPlugState: 'unplugged',
      legacyTs: '2026-09-12T14:00:00.000Z',
      physicalAccepted: true,
      physicalState: 'PLUGGED',
      physicalTs: '2026-09-12T15:00:00.000Z',
      provenExpectedFix: isProvenExpectedFix(null),
    });
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT,
    );
  });

  it('OLD_REJECT + NEW_ACCEPT with canonical proof => EXPECTED_FIX', () => {
    const result = compare({
      legacyAccepted: false,
      legacyPlugState: 'unplugged',
      legacyTs: '2026-09-12T14:00:00.000Z',
      physicalAccepted: true,
      physicalState: 'PLUGGED',
      physicalTs: '2026-09-12T15:00:00.000Z',
      provenExpectedFix: isProvenExpectedFix({
        scenario: 'SNAPSHOT_PLUG_REPAIR_UNPLUGGED_BASELINE',
        proven: true,
        evidenceReferenceId: 'snap',
        physicalEvidenceObservedAt: new Date('2026-09-12T15:00:00.000Z'),
        legacyEvidenceObservedAt: new Date('2026-09-12T14:00:00.000Z'),
      }),
    });
    expect(result.classification).toBe(
      PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
    );
  });
});
