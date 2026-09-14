import {
  buildSnapshotPlugRepairGtR1Proof,
  buildWebhookStaleLegacyGateGtR1Proof,
  isProvenExpectedFix,
} from './physical-state-gt-r1-proof';

describe('physical-state-gt-r1-proof', () => {
  const T1 = new Date('2026-08-01T10:00:00.000Z');
  const T2 = new Date('2026-09-12T15:02:29.000Z');
  const T3 = new Date('2026-09-12T16:27:51.000Z');

  it('legacy reason alone does not establish proof', () => {
    expect(
      buildSnapshotPlugRepairGtR1Proof({
        physicalProjectionState: null,
        physicalProjectionEvidenceAt: null,
        snapshotCandidatePlugged: true,
        snapshotEvidenceObservedAt: T2,
        legacyAccepted: false,
        evidenceReferenceId: 'snap',
      }),
    ).toBeNull();
    expect(isProvenExpectedFix(undefined)).toBe(false);
  });

  it('no_state_change diagnostic only -> no proof without independent conditions', () => {
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

  it('baseline_already_plugged diagnostic only -> no proof without independent conditions', () => {
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

  it('no_open_episode diagnostic only -> no proof without UNPLUGGED baseline + newer snapshot', () => {
    expect(
      buildSnapshotPlugRepairGtR1Proof({
        physicalProjectionState: 'PLUGGED',
        physicalProjectionEvidenceAt: T1,
        snapshotCandidatePlugged: true,
        snapshotEvidenceObservedAt: T2,
        legacyAccepted: false,
        evidenceReferenceId: 'snap',
      }),
    ).toBeNull();
  });

  it('snapshot UNPLUGGED baseline + newer PLUG + explicit proof -> EXPECTED_FIX eligible', () => {
    const proof = buildSnapshotPlugRepairGtR1Proof({
      physicalProjectionState: 'UNPLUGGED',
      physicalProjectionEvidenceAt: T1,
      snapshotCandidatePlugged: true,
      snapshotEvidenceObservedAt: T2,
      legacyAccepted: false,
      evidenceReferenceId: 'snap-gt-r1',
    });
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
});
