import type { DeviceConnectionPhysicalEffectiveState } from '@prisma/client';
import type { ObdPlugState } from '../device-connection-webhook.service';

/**
 * Canonical independent GT-R1 expected-fix proof contract.
 * Legacy diagnostic reasons MUST NOT satisfy this — only explicit proof objects.
 */
export type GtR1ExpectedFixProofScenario =
  | 'SNAPSHOT_PLUG_REPAIR_UNPLUGGED_BASELINE'
  | 'WEBHOOK_PHYSICAL_ORDERING_OVERRIDES_STALE_LEGACY_GATE';

export type GtR1ExpectedFixProof = {
  scenario: GtR1ExpectedFixProofScenario;
  proven: true;
  evidenceReferenceId: string;
  physicalEvidenceObservedAt: Date;
  legacyEvidenceObservedAt: Date | null;
};

export function isProvenExpectedFix(
  proof: GtR1ExpectedFixProof | null | undefined,
): boolean {
  if (!proof || proof.proven !== true) return false;
  if (!proof.scenario || !proof.evidenceReferenceId) return false;
  if (!(proof.physicalEvidenceObservedAt instanceof Date)) return false;
  return Number.isFinite(proof.physicalEvidenceObservedAt.getTime());
}

/**
 * Snapshot PLUG repair: physical UNPLUGGED baseline, newer snapshot PLUG, legacy path rejected.
 * Independent of legacy reason strings (e.g. no_open_episode).
 */
export function buildSnapshotPlugRepairGtR1Proof(input: {
  physicalProjectionState: DeviceConnectionPhysicalEffectiveState | null;
  physicalProjectionEvidenceAt: Date | null;
  snapshotCandidatePlugged: boolean;
  snapshotEvidenceObservedAt: Date;
  legacyAccepted: boolean;
  evidenceReferenceId: string;
}): GtR1ExpectedFixProof | null {
  if (input.legacyAccepted) return null;
  if (!input.snapshotCandidatePlugged) return null;
  if (input.physicalProjectionState !== 'UNPLUGGED') return null;
  if (!input.physicalProjectionEvidenceAt) return null;
  if (input.snapshotEvidenceObservedAt.getTime() <= input.physicalProjectionEvidenceAt.getTime()) {
    return null;
  }

  return {
    scenario: 'SNAPSHOT_PLUG_REPAIR_UNPLUGGED_BASELINE',
    proven: true,
    evidenceReferenceId: input.evidenceReferenceId,
    physicalEvidenceObservedAt: input.snapshotEvidenceObservedAt,
    legacyEvidenceObservedAt: input.physicalProjectionEvidenceAt,
  };
}

/**
 * Webhook physical ordering repair: legacy gate frozen on stale last-event state while
 * physical projection holds newer contradictory evidence.
 */
export function buildWebhookStaleLegacyGateGtR1Proof(input: {
  legacyAccepted: boolean;
  legacyEffectivePlugState: ObdPlugState | null;
  incomingPluggedIn: boolean;
  incomingObservedAt: Date;
  physicalProjectionState: DeviceConnectionPhysicalEffectiveState | null;
  physicalProjectionEvidenceAt: Date | null;
  evidenceReferenceId: string;
}): GtR1ExpectedFixProof | null {
  if (input.legacyAccepted) return null;
  if (!input.physicalProjectionState || !input.physicalProjectionEvidenceAt) return null;
  if (input.incomingObservedAt.getTime() <= input.physicalProjectionEvidenceAt.getTime()) {
    return null;
  }

  const incomingPlugState: ObdPlugState = input.incomingPluggedIn ? 'plugged' : 'unplugged';
  const physicalPlugState: ObdPlugState =
    input.physicalProjectionState === 'PLUGGED' ? 'plugged' : 'unplugged';

  if (legacyEffectivePlugStateMatchesIncoming(input.legacyEffectivePlugState, incomingPlugState)) {
    if (physicalPlugState === incomingPlugState) return null;
    return {
      scenario: 'WEBHOOK_PHYSICAL_ORDERING_OVERRIDES_STALE_LEGACY_GATE',
      proven: true,
      evidenceReferenceId: input.evidenceReferenceId,
      physicalEvidenceObservedAt: input.incomingObservedAt,
      legacyEvidenceObservedAt: input.physicalProjectionEvidenceAt,
    };
  }

  return null;
}

function legacyEffectivePlugStateMatchesIncoming(
  legacyState: ObdPlugState | null,
  incoming: ObdPlugState,
): boolean {
  if (!legacyState || legacyState === 'unknown') return false;
  return legacyState === incoming;
}
