import type {
  DeviceConnectionEpisode,
  DeviceConnectionPhysicalEffectiveState,
} from '@prisma/client';
import {
  isPhysicalObdHardware,
  isPhysicalObdSnapshotSource,
  type SnapshotPlugEvaluationOutcome,
  type SnapshotPlugRejectReason,
} from '../device-connection-episode-resolution/device-connection-episode-resolution.snapshot-evaluator';
import type { ObdPlugState } from '../device-connection-webhook.service';
import type { PhysicalStateBindingScope } from './device-connection-physical-state.types';

/**
 * Canonical independent GT-R1 expected-fix proof contract.
 * Legacy diagnostic reasons MUST NOT satisfy this — only explicit proof objects.
 */
export type GtR1ExpectedFixProofScenario =
  | 'SNAPSHOT_PLUG_REPAIR_UNPLUGGED_BASELINE'
  | 'SNAPSHOT_PLUG_INITIAL_ESTABLISHMENT'
  | 'WEBHOOK_PHYSICAL_ORDERING_OVERRIDES_STALE_LEGACY_GATE';

export type GtR1ExpectedFixProof = {
  scenario: GtR1ExpectedFixProofScenario;
  proven: true;
  evidenceReferenceId: string;
  physicalEvidenceObservedAt: Date;
  legacyEvidenceObservedAt: Date | null;
};

/** Only these typed legacy reject outcomes may contribute to snapshot GT-R1 proof. */
export const SNAPSHOT_GT_R1_ADMISSIBLE_LEGACY_REJECT_REASONS: ReadonlySet<SnapshotPlugRejectReason> =
  new Set(['no_open_episode']);

/** Hard reject families — NEVER establish EXPECTED_FIX for snapshot path. */
export const SNAPSHOT_HARD_REJECT_GT_R1_REASONS: ReadonlySet<SnapshotPlugRejectReason> =
  new Set([
    'binding_mismatch',
    'token_binding_mismatch',
    'organization_mismatch',
    'provider_mismatch',
    'non_physical_obd_hardware',
    'non_physical_snapshot_source',
    'synthetic_snapshot_source',
    'observed_before_unplug',
    'received_before_unplug',
    'historical_backfill',
    'obd_null',
    'obd_false',
  ]);

export function isProvenExpectedFix(
  proof: GtR1ExpectedFixProof | null | undefined,
): boolean {
  if (!proof || proof.proven !== true) return false;
  if (!proof.scenario || !proof.evidenceReferenceId) return false;
  if (!(proof.physicalEvidenceObservedAt instanceof Date)) return false;
  return Number.isFinite(proof.physicalEvidenceObservedAt.getTime());
}

export function isSnapshotHardRejectGtR1Reason(
  reason: SnapshotPlugRejectReason,
): boolean {
  return SNAPSHOT_HARD_REJECT_GT_R1_REASONS.has(reason);
}

export function isSnapshotGtR1AdmissibleLegacyReject(
  evaluation: SnapshotPlugEvaluationOutcome,
): boolean {
  if (evaluation.action !== 'reject') return false;
  return SNAPSHOT_GT_R1_ADMISSIBLE_LEGACY_REJECT_REASONS.has(evaluation.reason);
}

export function isSnapshotBindingAlignedWithEpisode(input: {
  episode: DeviceConnectionEpisode | null;
  physicalBindingScope: PhysicalStateBindingScope;
}): boolean {
  const episode = input.episode;
  if (!episode) return true;

  if (
    episode.providerDeviceIdHash != null &&
    episode.providerDeviceIdHash !== input.physicalBindingScope.providerDeviceIdHash
  ) {
    return false;
  }

  if (
    episode.deviceBindingId != null &&
    input.physicalBindingScope.deviceBindingId != null &&
    episode.deviceBindingId !== input.physicalBindingScope.deviceBindingId
  ) {
    return false;
  }

  return true;
}

export type SnapshotGtR1ProofInput = {
  physicalProjectionState: DeviceConnectionPhysicalEffectiveState | null;
  physicalProjectionEvidenceAt: Date | null;
  snapshotCandidatePlugged: boolean;
  snapshotEvidenceObservedAt: Date;
  legacyEvaluation: SnapshotPlugEvaluationOutcome;
  physicalBindingScope: PhysicalStateBindingScope;
  legacyBindingKey: string | null;
  episode: DeviceConnectionEpisode | null;
  hardwareType: string | null;
  snapshotSource: string | null;
  sourceSubtype: string | null;
  evidenceReferenceId: string;
};

function isValidSnapshotEvidenceObservedAt(observedAt: Date): boolean {
  return observedAt instanceof Date && Number.isFinite(observedAt.getTime());
}

function passesSharedSnapshotGtR1Admissibility(input: SnapshotGtR1ProofInput): boolean {
  if (!input.snapshotCandidatePlugged) return false;
  if (!isPhysicalObdHardware(input.hardwareType)) return false;
  if (
    !isPhysicalObdSnapshotSource({
      snapshotSource: input.snapshotSource,
      sourceSubtype: input.sourceSubtype,
    })
  ) {
    return false;
  }
  if (!isValidSnapshotEvidenceObservedAt(input.snapshotEvidenceObservedAt)) return false;
  if (
    !isSnapshotBindingAlignedWithEpisode({
      episode: input.episode,
      physicalBindingScope: input.physicalBindingScope,
    })
  ) {
    return false;
  }
  return true;
}

function isLegacyBindingAlignedForSnapshotProof(input: SnapshotGtR1ProofInput): boolean {
  if (input.legacyBindingKey == null) return true;
  return input.legacyBindingKey === input.physicalBindingScope.bindingKey;
}

/**
 * Snapshot PLUG repair: physical UNPLUGGED baseline, newer snapshot PLUG, legacy path rejected
 * only for the canonical GT-R1 stale/absence condition (no_open_episode) with independently
 * verified physical/source/binding preconditions.
 */
export function buildSnapshotPlugRepairGtR1Proof(
  input: SnapshotGtR1ProofInput,
): GtR1ExpectedFixProof | null {
  if (!passesSharedSnapshotGtR1Admissibility(input)) return null;
  if (!isLegacyBindingAlignedForSnapshotProof(input)) return null;
  if (input.legacyBindingKey !== input.physicalBindingScope.bindingKey) {
    return null;
  }
  if (input.physicalProjectionState !== 'UNPLUGGED') return null;
  if (!input.physicalProjectionEvidenceAt) return null;
  if (input.snapshotEvidenceObservedAt.getTime() <= input.physicalProjectionEvidenceAt.getTime()) {
    return null;
  }
  if (!isSnapshotGtR1AdmissibleLegacyReject(input.legacyEvaluation)) return null;
  if (
    input.legacyEvaluation.action === 'reject' &&
    input.legacyEvaluation.reason === 'no_open_episode' &&
    input.episode != null
  ) {
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
 * Snapshot PLUG bootstrap: no prior physical projection, admissible SNAPSHOT_OBD PLUG evidence,
 * legacy episode model rejects only for no_open_episode with aligned binding identity.
 *
 * Distinct from SNAPSHOT_PLUG_REPAIR_UNPLUGGED_BASELINE — never overloads repair semantics.
 */
export function buildSnapshotPlugInitialEstablishmentGtR1Proof(
  input: SnapshotGtR1ProofInput,
): GtR1ExpectedFixProof | null {
  if (!passesSharedSnapshotGtR1Admissibility(input)) return null;
  if (!isLegacyBindingAlignedForSnapshotProof(input)) return null;
  if (input.physicalProjectionState != null) return null;
  if (input.physicalProjectionEvidenceAt != null) return null;
  if (input.episode != null) return null;
  if (input.legacyEvaluation.action !== 'reject') return null;
  if (input.legacyEvaluation.reason !== 'no_open_episode') return null;

  return {
    scenario: 'SNAPSHOT_PLUG_INITIAL_ESTABLISHMENT',
    proven: true,
    evidenceReferenceId: input.evidenceReferenceId,
    physicalEvidenceObservedAt: input.snapshotEvidenceObservedAt,
    legacyEvidenceObservedAt: null,
  };
}

/**
 * Canonical snapshot GT-R1 proof resolver for production call-sites.
 * Repair (UNPLUGGED baseline) takes precedence over bootstrap (absent projection).
 */
export function buildSnapshotGtR1Proof(input: SnapshotGtR1ProofInput): GtR1ExpectedFixProof | null {
  return (
    buildSnapshotPlugRepairGtR1Proof(input) ??
    buildSnapshotPlugInitialEstablishmentGtR1Proof(input)
  );
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
