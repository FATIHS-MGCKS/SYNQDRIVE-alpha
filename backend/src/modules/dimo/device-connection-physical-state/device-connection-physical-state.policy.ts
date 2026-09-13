import { DeviceConnectionPhysicalTransitionDecision } from '@prisma/client';
import type {
  CurrentPhysicalStateProjection,
  IncomingPhysicalStateEvidence,
  PhysicalTransitionDecision,
} from './device-connection-physical-state.types';

export interface EvaluatePhysicalStateTransitionInput {
  current: CurrentPhysicalStateProjection | null;
  incoming: IncomingPhysicalStateEvidence;
}

export interface EvaluatePhysicalStateTransitionResult {
  decision: PhysicalTransitionDecision;
  nextState: IncomingPhysicalStateEvidence['candidateState'] | null;
  mutateProjection: boolean;
  refreshProvenanceOnly: boolean;
  reason?: string;
}

function sameEvidenceInstant(
  current: CurrentPhysicalStateProjection,
  incoming: IncomingPhysicalStateEvidence,
): boolean {
  return (
    current.evidenceObservedAt.getTime() === incoming.evidenceObservedAt.getTime() &&
    current.evidenceSource === incoming.evidenceSource &&
    current.evidenceReferenceId === incoming.evidenceReferenceId
  );
}

/**
 * Pure deterministic physical-state transition policy.
 *
 * Ordering authority: evidenceObservedAt (physical/source time), never receivedAt
 * or providerFetchedAt.
 */
export function evaluatePhysicalStateTransition(
  input: EvaluatePhysicalStateTransitionInput,
): EvaluatePhysicalStateTransitionResult {
  const { current, incoming } = input;

  if (!incoming.evidenceObservedAt || Number.isNaN(incoming.evidenceObservedAt.getTime())) {
    return {
      decision: DeviceConnectionPhysicalTransitionDecision.INSUFFICIENT_EVIDENCE,
      nextState: null,
      mutateProjection: false,
      refreshProvenanceOnly: false,
      reason: 'missing_evidence_observed_at',
    };
  }

  if (!incoming.evidenceReferenceId?.trim()) {
    return {
      decision: DeviceConnectionPhysicalTransitionDecision.INSUFFICIENT_EVIDENCE,
      nextState: null,
      mutateProjection: false,
      refreshProvenanceOnly: false,
      reason: 'missing_evidence_reference_id',
    };
  }

  if (!current) {
    return {
      decision: DeviceConnectionPhysicalTransitionDecision.ESTABLISHED,
      nextState: incoming.candidateState,
      mutateProjection: true,
      refreshProvenanceOnly: false,
    };
  }

  const incomingMs = incoming.evidenceObservedAt.getTime();
  const currentMs = current.evidenceObservedAt.getTime();

  if (incomingMs < currentMs) {
    return {
      decision: DeviceConnectionPhysicalTransitionDecision.STALE,
      nextState: null,
      mutateProjection: false,
      refreshProvenanceOnly: false,
      reason: 'stale_evidence_observed_at',
    };
  }

  if (incomingMs === currentMs) {
    if (current.effectiveState !== incoming.candidateState) {
      return {
        decision: DeviceConnectionPhysicalTransitionDecision.CONFLICT,
        nextState: null,
        mutateProjection: false,
        refreshProvenanceOnly: false,
        reason: 'equal_timestamp_conflicting_state',
      };
    }

    if (sameEvidenceInstant(current, incoming)) {
      return {
        decision: DeviceConnectionPhysicalTransitionDecision.DUPLICATE,
        nextState: incoming.candidateState,
        mutateProjection: false,
        refreshProvenanceOnly: false,
        reason: 'duplicate_evidence',
      };
    }

    return {
      decision: DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH,
      nextState: incoming.candidateState,
      mutateProjection: true,
      refreshProvenanceOnly: true,
      reason: 'provenance_refresh_same_state',
    };
  }

  if (current.effectiveState === incoming.candidateState) {
    return {
      decision: DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH,
      nextState: incoming.candidateState,
      mutateProjection: true,
      refreshProvenanceOnly: true,
      reason: 'newer_provenance_same_state',
    };
  }

  return {
    decision: DeviceConnectionPhysicalTransitionDecision.APPLIED,
    nextState: incoming.candidateState,
    mutateProjection: true,
    refreshProvenanceOnly: false,
    reason: 'state_transition',
  };
}

export function isAcceptedPhysicalTransition(
  decision: PhysicalTransitionDecision,
): boolean {
  return (
    decision === DeviceConnectionPhysicalTransitionDecision.ESTABLISHED ||
    decision === DeviceConnectionPhysicalTransitionDecision.APPLIED ||
    decision === DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH
  );
}

export function isLogicalStateChange(
  decision: PhysicalTransitionDecision,
  previousState: CurrentPhysicalStateProjection | null,
  nextState: IncomingPhysicalStateEvidence['candidateState'] | null,
): boolean {
  if (
    decision !== DeviceConnectionPhysicalTransitionDecision.ESTABLISHED &&
    decision !== DeviceConnectionPhysicalTransitionDecision.APPLIED
  ) {
    return false;
  }
  if (!previousState || !nextState) {
    return decision === DeviceConnectionPhysicalTransitionDecision.ESTABLISHED;
  }
  return previousState.effectiveState !== nextState;
}
