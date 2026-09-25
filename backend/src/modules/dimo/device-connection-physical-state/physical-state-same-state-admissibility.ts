import { DeviceConnectionPhysicalTransitionDecision } from '@prisma/client';
import type {
  CurrentPhysicalStateProjection,
  IncomingPhysicalStateEvidence,
  PhysicalEvidenceSource,
} from './device-connection-physical-state.types';
import type { PhysicalStateShadowComparisonInput } from './physical-state-shadow-comparator.types';

export type SameStateProvenanceRefreshVariant =
  | 'SNAPSHOT_PLUG_NO_OPEN_EPISODE_STRICTLY_NEWER'
  | 'SNAPSHOT_PLUG_NO_OPEN_EPISODE_EQUAL_TIMESTAMP_CROSS_CHANNEL'
  | 'WEBHOOK_PLUG_NO_STATE_CHANGE'
  | 'SNAPSHOT_UNPLUG_OBD_FALSE_EPISODE_WORKFLOW';

export type ProvenSameStateProvenanceRefreshProof = {
  proven: true;
  variant: SameStateProvenanceRefreshVariant;
  evidenceReferenceId: string;
};

export type SameStateRefreshAdmissibilityInput = {
  comparison: PhysicalStateShadowComparisonInput;
  previousProjection: CurrentPhysicalStateProjection | null;
  incoming: IncomingPhysicalStateEvidence;
};

function normalizeLegacyReason(reason: string | null | undefined): string | null {
  if (reason == null) return null;
  const trimmed = reason.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveComparisonBindingKeys(input: PhysicalStateShadowComparisonInput): {
  legacy: string | null;
  physical: string | null;
} {
  const legacy =
    input.legacyBindingKey !== undefined ? input.legacyBindingKey : input.bindingKey ?? null;
  const physical = input.physicalBindingKey ?? input.bindingKey ?? null;
  return { legacy, physical };
}

/** Non-null aligned bindings required for proven same-state refresh. */
export function bindingsAlignedForSameStateProof(input: PhysicalStateShadowComparisonInput): boolean {
  const { legacy, physical } = resolveComparisonBindingKeys(input);
  if (!legacy?.trim() || !physical?.trim()) return false;
  return legacy === physical;
}

function sameEvidenceInstant(
  previous: CurrentPhysicalStateProjection,
  incoming: IncomingPhysicalStateEvidence,
): boolean {
  return (
    previous.evidenceObservedAt.getTime() === incoming.evidenceObservedAt.getTime() &&
    previous.evidenceSource === incoming.evidenceSource &&
    previous.evidenceReferenceId === incoming.evidenceReferenceId
  );
}

function isAdmissibleEvidenceSource(source: PhysicalEvidenceSource): boolean {
  return source === 'WEBHOOK' || source === 'SNAPSHOT_OBD';
}

/**
 * Online row admissibility only — no future-transition lookahead.
 * Sequence safety (later APPLIED) is proven in policy + dedicated sequence tests.
 */
export function proveNonIsomorphicSameStateProvenanceRefresh(
  input: SameStateRefreshAdmissibilityInput,
): ProvenSameStateProvenanceRefreshProof | null {
  const { comparison, previousProjection, incoming } = input;
  const transition = comparison.physicalDecision.transitionDecision ?? null;
  const legacyReason = normalizeLegacyReason(comparison.legacyDecision.reason);

  if (comparison.equalTimeOpposingState) return null;
  if (transition === DeviceConnectionPhysicalTransitionDecision.CONFLICT) return null;
  if (transition === DeviceConnectionPhysicalTransitionDecision.STALE) return null;
  if (transition === DeviceConnectionPhysicalTransitionDecision.DUPLICATE) return null;
  if (transition !== DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH) return null;
  if (!comparison.physicalDecision.accepted) return null;
  if (comparison.legacyDecision.accepted) return null;
  if (!bindingsAlignedForSameStateProof(comparison)) return null;
  if (!previousProjection) return null;
  if (!isAdmissibleEvidenceSource(incoming.evidenceSource)) return null;

  const previousState = previousProjection.effectiveState;
  const candidateState = incoming.candidateState;
  const effectiveState = comparison.physicalDecision.effectiveState ?? null;

  if (previousState !== candidateState) return null;
  if (effectiveState !== previousState) return null;

  const incomingMs = incoming.evidenceObservedAt.getTime();
  const previousMs = previousProjection.evidenceObservedAt.getTime();
  if (!Number.isFinite(incomingMs) || !Number.isFinite(previousMs)) return null;
  if (incomingMs < previousMs) return null;

  if (incomingMs === previousMs) {
    if (sameEvidenceInstant(previousProjection, incoming)) return null;
    if (previousState !== candidateState) return null;
  }

  const evidenceReferenceId = incoming.evidenceReferenceId;

  if (
    incoming.evidenceSource === 'SNAPSHOT_OBD' &&
    candidateState === 'PLUGGED' &&
    legacyReason === 'no_open_episode'
  ) {
    if (incomingMs > previousMs) {
      return {
        proven: true,
        variant: 'SNAPSHOT_PLUG_NO_OPEN_EPISODE_STRICTLY_NEWER',
        evidenceReferenceId,
      };
    }
    if (incomingMs === previousMs) {
      if (sameEvidenceInstant(previousProjection, incoming)) return null;
      if (previousProjection.evidenceSource !== 'WEBHOOK') return null;
      return {
        proven: true,
        variant: 'SNAPSHOT_PLUG_NO_OPEN_EPISODE_EQUAL_TIMESTAMP_CROSS_CHANNEL',
        evidenceReferenceId,
      };
    }
    return null;
  }

  if (
    incoming.evidenceSource === 'WEBHOOK' &&
    candidateState === 'PLUGGED' &&
    legacyReason === 'no_state_change'
  ) {
    return {
      proven: true,
      variant: 'WEBHOOK_PLUG_NO_STATE_CHANGE',
      evidenceReferenceId,
    };
  }

  if (
    incoming.evidenceSource === 'SNAPSHOT_OBD' &&
    candidateState === 'UNPLUGGED' &&
    legacyReason === 'obd_false'
  ) {
    return {
      proven: true,
      variant: 'SNAPSHOT_UNPLUG_OBD_FALSE_EPISODE_WORKFLOW',
      evidenceReferenceId,
    };
  }

  return null;
}

export function isProvenNonIsomorphicSameStateRefresh(
  proof: ProvenSameStateProvenanceRefreshProof | null | undefined,
): boolean {
  return proof?.proven === true && Boolean(proof.variant) && Boolean(proof.evidenceReferenceId);
}
