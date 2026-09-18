import { DeviceConnectionPhysicalTransitionDecision } from '@prisma/client';
import {
  buildSnapshotGtR1Proof,
  buildSnapshotPlugInitialEstablishmentGtR1Proof,
  buildSnapshotPlugRepairGtR1Proof,
  buildSnapshotUnplugInitialEstablishmentGtR1Proof,
  buildSnapshotUnplugTransitionGtR1Proof,
  buildWebhookStaleLegacyGateGtR1Proof,
  isProvenExpectedFix,
  isProvenExpectedFixForPhysicalDecision,
  isSnapshotHardRejectGtR1Reason,
  SNAPSHOT_HARD_REJECT_GT_R1_REASONS,
  type SnapshotGtR1ProofInput,
} from './physical-state-gt-r1-proof';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';

describe('physical-state-gt-r1-proof', () => {
  const T1 = new Date('2026-08-01T10:00:00.000Z');
  const T2 = new Date('2026-09-12T15:02:29.000Z');
  const T3 = new Date('2026-09-12T16:27:51.000Z');
  const binding = buildBindingScopeFromToken({ provider: 'DIMO', tokenId: 187336 });

  const admissibleBase: SnapshotGtR1ProofInput = {
    physicalProjectionState: 'UNPLUGGED',
    physicalProjectionEvidenceAt: T1,
    snapshotCandidatePlugged: true,
    snapshotEvidenceObservedAt: T2,
    legacyEvaluation: { action: 'reject', reason: 'no_open_episode' },
    physicalBindingScope: binding,
    legacyBindingKey: binding.bindingKey,
    episode: null,
    hardwareType: 'LTE_R1',
    snapshotSource: 'dimo',
    sourceSubtype: null,
    evidenceReferenceId: 'snap-gt-r1',
  };

  const bootstrapBase: SnapshotGtR1ProofInput = {
    physicalProjectionState: null,
    physicalProjectionEvidenceAt: null,
    snapshotCandidatePlugged: true,
    snapshotEvidenceObservedAt: T2,
    legacyEvaluation: { action: 'reject', reason: 'no_open_episode' },
    physicalBindingScope: binding,
    legacyBindingKey: binding.bindingKey,
    episode: null,
    hardwareType: 'LTE_R1',
    snapshotSource: 'dimo',
    sourceSubtype: null,
    evidenceReferenceId: 'snap-bootstrap',
  };

  it('legacy reason alone does not establish proof', () => {
    expect(
      buildSnapshotPlugRepairGtR1Proof({
        ...admissibleBase,
        physicalProjectionState: null,
        physicalProjectionEvidenceAt: null,
      }),
    ).toBeNull();
    expect(isProvenExpectedFix(undefined)).toBe(false);
  });

  it('no_state_change diagnostic only -> no webhook proof without independent conditions', () => {
    expect(
      buildWebhookStaleLegacyGateGtR1Proof({
        legacyAccepted: false,
        legacyEffectivePlugState: 'unplugged',
        incomingPluggedIn: false,
        incomingObservedAt: T3,
        physicalProjectionState: null,
        physicalProjectionEvidenceAt: null,
        evidenceReferenceId: 'wh',
      }),
    ).toBeNull();
  });

  it('baseline_already_plugged diagnostic only -> no webhook proof without independent conditions', () => {
    expect(
      buildWebhookStaleLegacyGateGtR1Proof({
        legacyAccepted: false,
        legacyEffectivePlugState: 'unknown',
        incomingPluggedIn: true,
        incomingObservedAt: T2,
        physicalProjectionState: 'UNPLUGGED',
        physicalProjectionEvidenceAt: T1,
        evidenceReferenceId: 'wh',
      }),
    ).toBeNull();
  });

  it('no_open_episode without UNPLUGGED baseline -> no proof', () => {
    expect(
      buildSnapshotPlugRepairGtR1Proof({
        ...admissibleBase,
        physicalProjectionState: 'PLUGGED',
      }),
    ).toBeNull();
  });

  it('snapshot UNPLUGGED baseline + newer PLUG + typed no_open_episode -> EXPECTED_FIX eligible', () => {
    const proof = buildSnapshotPlugRepairGtR1Proof(admissibleBase);
    expect(proof?.proven).toBe(true);
    expect(isProvenExpectedFix(proof)).toBe(true);
  });

  it('webhook stale legacy gate + newer physical ordering -> EXPECTED_FIX eligible', () => {
    const proof = buildWebhookStaleLegacyGateGtR1Proof({
      legacyAccepted: false,
      legacyEffectivePlugState: 'unplugged',
      incomingPluggedIn: false,
      incomingObservedAt: T3,
      physicalProjectionState: 'PLUGGED',
      physicalProjectionEvidenceAt: T2,
      evidenceReferenceId: 'wh-gt-r1',
    });
    expect(proof?.scenario).toBe('WEBHOOK_PHYSICAL_ORDERING_OVERRIDES_STALE_LEGACY_GATE');
    expect(isProvenExpectedFix(proof)).toBe(true);
  });

  it('forged boolean without canonical proof object is rejected', () => {
    expect(isProvenExpectedFix({ proven: true } as never)).toBe(false);
  });

  it.each([...SNAPSHOT_HARD_REJECT_GT_R1_REASONS])(
    'hard reject %s cannot establish EXPECTED_FIX',
    (reason) => {
      expect(isSnapshotHardRejectGtR1Reason(reason)).toBe(true);
      expect(
        buildSnapshotPlugRepairGtR1Proof({
          ...admissibleBase,
          legacyEvaluation: { action: 'reject', reason },
        }),
      ).toBeNull();
    },
  );

  it('synthetic snapshot source cannot establish EXPECTED_FIX', () => {
    expect(
      buildSnapshotPlugRepairGtR1Proof({
        ...admissibleBase,
        sourceSubtype: 'SYNTHETIC_TEST',
      }),
    ).toBeNull();
  });

  it('non-physical hardware cannot establish EXPECTED_FIX', () => {
    expect(
      buildSnapshotPlugRepairGtR1Proof({
        ...admissibleBase,
        hardwareType: 'OEM_ONLY',
      }),
    ).toBeNull();
  });

  it('binding mismatch episode vs physical scope cannot establish EXPECTED_FIX', () => {
    expect(
      buildSnapshotPlugRepairGtR1Proof({
        ...admissibleBase,
        episode: {
          id: 'ep',
          organizationId: 'org',
          vehicleId: 'veh',
          provider: 'DIMO',
          deviceBindingId: null,
          providerDeviceIdHash: 'old-hash',
          openedAt: T1,
          openedByEventId: null,
          openedReason: 'OBD_DEVICE_UNPLUGGED_WEBHOOK',
          status: 'OPEN',
          resolvedAt: null,
          resolutionMethod: null,
          resolutionEvidenceAt: null,
          resolutionEventId: null,
          resolutionSnapshotId: null,
          reviewReasonCodes: [],
          stateVersion: 1,
          createdAt: T1,
          updatedAt: T1,
        },
      }),
    ).toBeNull();
  });

  it('mismatched legacy binding key cannot establish EXPECTED_FIX', () => {
    const otherBinding = buildBindingScopeFromToken({ provider: 'DIMO', tokenId: 999001 });
    expect(
      buildSnapshotPlugRepairGtR1Proof({
        ...admissibleBase,
        legacyBindingKey: otherBinding.bindingKey,
      }),
    ).toBeNull();
  });

  it('null legacy binding cannot establish EXPECTED_FIX (fail closed)', () => {
    expect(
      buildSnapshotPlugRepairGtR1Proof({
        ...admissibleBase,
        legacyBindingKey: null,
      }),
    ).toBeNull();
  });

  it('bootstrap absent projection + no_open_episode -> SNAPSHOT_PLUG_INITIAL_ESTABLISHMENT', () => {
    const proof = buildSnapshotPlugInitialEstablishmentGtR1Proof(bootstrapBase);
    expect(proof?.scenario).toBe('SNAPSHOT_PLUG_INITIAL_ESTABLISHMENT');
    expect(isProvenExpectedFix(proof)).toBe(true);
    expect(proof?.legacyEvidenceObservedAt).toBeNull();
  });

  it('buildSnapshotGtR1Proof prefers repair over bootstrap when UNPLUGGED baseline exists', () => {
    const proof = buildSnapshotGtR1Proof(admissibleBase);
    expect(proof?.scenario).toBe('SNAPSHOT_PLUG_REPAIR_UNPLUGGED_BASELINE');
  });

  it('buildSnapshotGtR1Proof uses bootstrap when projection absent', () => {
    const proof = buildSnapshotGtR1Proof(bootstrapBase);
    expect(proof?.scenario).toBe('SNAPSHOT_PLUG_INITIAL_ESTABLISHMENT');
  });

  it('bootstrap proof does not apply when projection already PLUGGED', () => {
    expect(
      buildSnapshotPlugInitialEstablishmentGtR1Proof({
        ...bootstrapBase,
        physicalProjectionState: 'PLUGGED',
        physicalProjectionEvidenceAt: T1,
      }),
    ).toBeNull();
  });

  it('bootstrap proof does not apply when projection already UNPLUGGED (repair path only)', () => {
    expect(
      buildSnapshotPlugInitialEstablishmentGtR1Proof({
        ...bootstrapBase,
        physicalProjectionState: 'UNPLUGGED',
        physicalProjectionEvidenceAt: T1,
      }),
    ).toBeNull();
  });

  it('bootstrap proof does not apply for UNPLUGGED snapshot evidence', () => {
    expect(
      buildSnapshotPlugInitialEstablishmentGtR1Proof({
        ...bootstrapBase,
        snapshotCandidatePlugged: false,
      }),
    ).toBeNull();
  });

  it('bootstrap proof does not apply for non-no_open_episode legacy reject', () => {
    expect(
      buildSnapshotPlugInitialEstablishmentGtR1Proof({
        ...bootstrapBase,
        legacyEvaluation: { action: 'reject', reason: 'obd_false' },
      }),
    ).toBeNull();
  });

  it('bootstrap proof does not apply when open episode exists', () => {
    expect(
      buildSnapshotPlugInitialEstablishmentGtR1Proof({
        ...bootstrapBase,
        episode: {
          id: 'ep',
          organizationId: 'org',
          vehicleId: 'veh',
          provider: 'DIMO',
          deviceBindingId: null,
          providerDeviceIdHash: binding.providerDeviceIdHash,
          openedAt: T1,
          openedByEventId: null,
          openedReason: 'OBD_DEVICE_UNPLUGGED_WEBHOOK',
          status: 'OPEN',
          resolvedAt: null,
          resolutionMethod: null,
          resolutionEvidenceAt: null,
          resolutionEventId: null,
          resolutionSnapshotId: null,
          reviewReasonCodes: [],
          stateVersion: 1,
          createdAt: T1,
          updatedAt: T1,
        },
      }),
    ).toBeNull();
  });

  it('bootstrap proof does not apply on binding mismatch', () => {
    const otherBinding = buildBindingScopeFromToken({ provider: 'DIMO', tokenId: 999001 });
    expect(
      buildSnapshotPlugInitialEstablishmentGtR1Proof({
        ...bootstrapBase,
        legacyBindingKey: otherBinding.bindingKey,
      }),
    ).toBeNull();
  });

  it('bootstrap proof allows null legacy binding when no legacy persisted identity exists', () => {
    const proof = buildSnapshotPlugInitialEstablishmentGtR1Proof({
      ...bootstrapBase,
      legacyBindingKey: null,
    });
    expect(proof?.scenario).toBe('SNAPSHOT_PLUG_INITIAL_ESTABLISHMENT');
    expect(isProvenExpectedFix(proof)).toBe(true);
  });

  it('bootstrap proof does not apply for synthetic snapshot source', () => {
    expect(
      buildSnapshotPlugInitialEstablishmentGtR1Proof({
        ...bootstrapBase,
        sourceSubtype: 'SYNTHETIC_TEST',
      }),
    ).toBeNull();
  });

  it('bootstrap proof does not apply for invalid evidence timestamp', () => {
    expect(
      buildSnapshotPlugInitialEstablishmentGtR1Proof({
        ...bootstrapBase,
        snapshotEvidenceObservedAt: new Date('invalid'),
      }),
    ).toBeNull();
  });

  it('malformed proof object without scenario is rejected', () => {
    expect(
      isProvenExpectedFix({
        proven: true,
        evidenceReferenceId: 'x',
        physicalEvidenceObservedAt: T2,
        legacyEvidenceObservedAt: null,
      } as never),
    ).toBe(false);
  });

  it('BOOTSTRAP-ACTUAL-1 initial-establishment proof + ESTABLISHED => proven expected fix YES', () => {
    const proof = buildSnapshotPlugInitialEstablishmentGtR1Proof(bootstrapBase);
    expect(
      isProvenExpectedFixForPhysicalDecision(
        proof,
        DeviceConnectionPhysicalTransitionDecision.ESTABLISHED,
      ),
    ).toBe(true);
  });

  it('BOOTSTRAP-ACTUAL-2 initial-establishment proof + APPLIED => proven expected fix NO', () => {
    const proof = buildSnapshotPlugInitialEstablishmentGtR1Proof(bootstrapBase);
    expect(
      isProvenExpectedFixForPhysicalDecision(
        proof,
        DeviceConnectionPhysicalTransitionDecision.APPLIED,
      ),
    ).toBe(false);
  });

  it('BOOTSTRAP-ACTUAL-3 initial-establishment proof + PROVENANCE_REFRESH => proven expected fix NO', () => {
    const proof = buildSnapshotPlugInitialEstablishmentGtR1Proof(bootstrapBase);
    expect(
      isProvenExpectedFixForPhysicalDecision(
        proof,
        DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH,
      ),
    ).toBe(false);
  });

  it.each([
    DeviceConnectionPhysicalTransitionDecision.DUPLICATE,
    DeviceConnectionPhysicalTransitionDecision.STALE,
    DeviceConnectionPhysicalTransitionDecision.CONFLICT,
    DeviceConnectionPhysicalTransitionDecision.INSUFFICIENT_EVIDENCE,
    null,
  ])(
    'BOOTSTRAP-ACTUAL-4 initial-establishment proof + %s => proven expected fix NO',
    (decision) => {
      const proof = buildSnapshotPlugInitialEstablishmentGtR1Proof(bootstrapBase);
      expect(isProvenExpectedFixForPhysicalDecision(proof, decision)).toBe(false);
    },
  );

  it('repair proof remains valid for APPLIED transition (not bootstrap-bound)', () => {
    const proof = buildSnapshotPlugRepairGtR1Proof(admissibleBase);
    expect(
      isProvenExpectedFixForPhysicalDecision(
        proof,
        DeviceConnectionPhysicalTransitionDecision.APPLIED,
      ),
    ).toBe(true);
  });

  it('UNPLUG transition: PLUGGED baseline + newer UNPLUG + obd_false => SNAPSHOT_UNPLUG_TRANSITION', () => {
    const proof = buildSnapshotUnplugTransitionGtR1Proof({
      ...admissibleBase,
      physicalProjectionState: 'PLUGGED',
      snapshotCandidatePlugged: false,
      snapshotEvidenceObservedAt: T3,
      legacyEvaluation: { action: 'reject', reason: 'obd_false' },
    });
    expect(proof?.scenario).toBe('SNAPSHOT_UNPLUG_TRANSITION');
    expect(
      isProvenExpectedFixForPhysicalDecision(
        proof,
        DeviceConnectionPhysicalTransitionDecision.APPLIED,
      ),
    ).toBe(true);
  });

  it('UNPLUG bootstrap: absent projection + UNPLUG + obd_false => SNAPSHOT_UNPLUG_INITIAL_ESTABLISHMENT', () => {
    const proof = buildSnapshotUnplugInitialEstablishmentGtR1Proof({
      ...bootstrapBase,
      snapshotCandidatePlugged: false,
      legacyEvaluation: { action: 'reject', reason: 'obd_false' },
    });
    expect(proof?.scenario).toBe('SNAPSHOT_UNPLUG_INITIAL_ESTABLISHMENT');
    expect(
      isProvenExpectedFixForPhysicalDecision(
        proof,
        DeviceConnectionPhysicalTransitionDecision.ESTABLISHED,
      ),
    ).toBe(true);
  });

  it('buildSnapshotGtR1Proof resolves UNPLUG transition when PLUGGED baseline exists', () => {
    const proof = buildSnapshotGtR1Proof({
      ...admissibleBase,
      physicalProjectionState: 'PLUGGED',
      snapshotCandidatePlugged: false,
      snapshotEvidenceObservedAt: T3,
      legacyEvaluation: { action: 'reject', reason: 'obd_false' },
    });
    expect(proof?.scenario).toBe('SNAPSHOT_UNPLUG_TRANSITION');
  });

  it('no_open_episode with open episode present cannot establish EXPECTED_FIX', () => {
    expect(
      buildSnapshotPlugRepairGtR1Proof({
        ...admissibleBase,
        episode: {
          id: 'ep',
          organizationId: 'org',
          vehicleId: 'veh',
          provider: 'DIMO',
          deviceBindingId: null,
          providerDeviceIdHash: binding.providerDeviceIdHash,
          openedAt: T1,
          openedByEventId: null,
          openedReason: 'OBD_DEVICE_UNPLUGGED_WEBHOOK',
          status: 'OPEN',
          resolvedAt: null,
          resolutionMethod: null,
          resolutionEvidenceAt: null,
          resolutionEventId: null,
          resolutionSnapshotId: null,
          reviewReasonCodes: [],
          stateVersion: 1,
          createdAt: T1,
          updatedAt: T1,
        },
      }),
    ).toBeNull();
  });
});
