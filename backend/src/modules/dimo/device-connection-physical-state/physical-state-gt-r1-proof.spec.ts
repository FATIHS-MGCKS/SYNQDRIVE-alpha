import {
  buildSnapshotPlugRepairGtR1Proof,
  buildWebhookStaleLegacyGateGtR1Proof,
  isProvenExpectedFix,
  isSnapshotHardRejectGtR1Reason,
  SNAPSHOT_HARD_REJECT_GT_R1_REASONS,
} from './physical-state-gt-r1-proof';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';

describe('physical-state-gt-r1-proof', () => {
  const T1 = new Date('2026-08-01T10:00:00.000Z');
  const T2 = new Date('2026-09-12T15:02:29.000Z');
  const T3 = new Date('2026-09-12T16:27:51.000Z');
  const binding = buildBindingScopeFromToken({ provider: 'DIMO', tokenId: 187336 });

  const admissibleBase = {
    physicalProjectionState: 'UNPLUGGED' as const,
    physicalProjectionEvidenceAt: T1,
    snapshotCandidatePlugged: true,
    snapshotEvidenceObservedAt: T2,
    legacyEvaluation: { action: 'reject' as const, reason: 'no_open_episode' as const },
    physicalBindingScope: binding,
    episode: null,
    hardwareType: 'LTE_R1',
    snapshotSource: 'dimo',
    sourceSubtype: null,
    evidenceReferenceId: 'snap-gt-r1',
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
