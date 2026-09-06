import { TripDetectionState, TripStatus } from '@prisma/client';

/** Durable trip facts needed for lifecycle invariant evaluation. */
export interface TripLifecycleTripFact {
  id: string;
  tripStatus: TripStatus;
  startTime: Date;
  endTime?: Date | null;
  dimoSegmentId?: string | null;
  tripSource?: string | null;
  rawDetectionMeta?: unknown;
}

export interface TripLifecycleInvariantInput {
  vehicleId: string;
  fsmState: TripDetectionState;
  activeTripId?: string | null;
  possibleStartAt?: Date | null;
  /** Confirmed/effective start anchor for orphan proof (start path). */
  expectedStartAt?: Date | null;
  expectedDimoSegmentId?: string | null;
  /** When merge path was chosen, the trip id targeted for reopen. */
  mergeTargetTripId?: string | null;
  ongoingTrips: TripLifecycleTripFact[];
  referencedTrip?: TripLifecycleTripFact | null;
}

export type TripLifecycleInvariantClassification =
  | 'HEALTHY'
  | 'HEALTHY_RESTING'
  | 'HEALTHY_POSSIBLE_START'
  | 'RECOVERABLE_START_ORPHAN'
  | 'RECOVERABLE_MERGE_ORPHAN'
  | 'RECOVERABLE_END_ORPHAN'
  | 'RECOVERABLE_MISSING_POINTER'
  | 'RECOVERABLE_SPLIT_REPOINT'
  | 'CONFLICT_MULTIPLE_ONGOING'
  | 'CONFLICT_MISMATCH'
  | 'CONFLICT_AMBIGUOUS';

export type TripLifecycleRecoveryAction =
  | 'NONE'
  | 'ADOPT_ONGOING'
  | 'RESET_TO_RESTING'
  | 'REPOINT_ACTIVE_TRIP'
  | 'NO_SAFE_REPAIR';

export interface TripLifecycleInvariantResult {
  classification: TripLifecycleInvariantClassification;
  action: TripLifecycleRecoveryAction;
  reason: string;
  tripId?: string;
  expectedFsmState?: TripDetectionState;
  evidence: Record<string, unknown>;
}

const ACTIVE_FSM_STATES: TripDetectionState[] = [
  TripDetectionState.ACTIVE_TRIP,
  TripDetectionState.IDLE_WITHIN_TRIP,
  TripDetectionState.POSSIBLE_END,
];

export function buildDeterministicLiveStartSegmentId(
  vehicleId: string,
  startTime: Date,
): string {
  return `v2-${vehicleId}-${startTime.getTime()}`;
}

function readSplitFrom(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const splitFrom = (meta as Record<string, unknown>).splitFrom;
  return typeof splitFrom === 'string' ? splitFrom : null;
}

/** Strong durable proof that an ONGOING row belongs to the current start episode. */
export function provesStartEpisodeRelationship(
  ongoing: TripLifecycleTripFact,
  input: Pick<
    TripLifecycleInvariantInput,
    | 'vehicleId'
    | 'possibleStartAt'
    | 'expectedStartAt'
    | 'expectedDimoSegmentId'
    | 'mergeTargetTripId'
  >,
): boolean {
  if (input.mergeTargetTripId && ongoing.id === input.mergeTargetTripId) {
    return true;
  }

  const anchor = input.expectedStartAt ?? input.possibleStartAt;
  if (!anchor) return false;

  if (ongoing.startTime.getTime() === anchor.getTime()) {
    return true;
  }

  const expectedSegmentId =
    input.expectedDimoSegmentId ??
    buildDeterministicLiveStartSegmentId(input.vehicleId, anchor);

  if (ongoing.dimoSegmentId && ongoing.dimoSegmentId === expectedSegmentId) {
    return true;
  }

  return false;
}

/** Proof for repointing FSM when activeTripId is missing but one ONGOING exists. */
export function provesActiveEpisodeRelationship(
  ongoing: TripLifecycleTripFact,
  input: Pick<
    TripLifecycleInvariantInput,
    'vehicleId' | 'possibleStartAt' | 'expectedStartAt' | 'expectedDimoSegmentId'
  >,
): boolean {
  if (input.possibleStartAt) {
    if (ongoing.startTime.getTime() === input.possibleStartAt.getTime()) {
      return true;
    }
    const expectedSegmentId = buildDeterministicLiveStartSegmentId(
      input.vehicleId,
      input.possibleStartAt,
    );
    if (ongoing.dimoSegmentId === expectedSegmentId) {
      return true;
    }
  }

  return provesStartEpisodeRelationship(ongoing, input);
}

function healthy(
  classification: TripLifecycleInvariantClassification,
  reason: string,
  evidence: Record<string, unknown> = {},
): TripLifecycleInvariantResult {
  return {
    classification,
    action: 'NONE',
    reason,
    evidence,
  };
}

function recoverable(
  classification: TripLifecycleInvariantClassification,
  action: Exclude<TripLifecycleRecoveryAction, 'NONE' | 'NO_SAFE_REPAIR'>,
  tripId: string,
  reason: string,
  expectedFsmState: TripDetectionState,
  evidence: Record<string, unknown> = {},
): TripLifecycleInvariantResult {
  return {
    classification,
    action,
    reason,
    tripId,
    expectedFsmState,
    evidence,
  };
}

function failClosed(
  classification:
    | 'CONFLICT_MULTIPLE_ONGOING'
    | 'CONFLICT_MISMATCH'
    | 'CONFLICT_AMBIGUOUS',
  reason: string,
  evidence: Record<string, unknown> = {},
): TripLifecycleInvariantResult {
  return {
    classification,
    action: 'NO_SAFE_REPAIR',
    reason,
    evidence,
  };
}

/**
 * Pure lifecycle invariant planner (R2).
 * Does not mutate database state.
 */
export function evaluateTripLifecycleInvariant(
  input: TripLifecycleInvariantInput,
): TripLifecycleInvariantResult {
  const ongoingTrips = input.ongoingTrips.filter(
    (t) => t.tripStatus === TripStatus.ONGOING,
  );
  const ongoingCount = ongoingTrips.length;
  const soleOngoing = ongoingCount === 1 ? ongoingTrips[0]! : null;
  const referenced = input.referencedTrip ?? null;
  const activeTripId = input.activeTripId ?? null;

  const baseEvidence = {
    fsmState: input.fsmState,
    activeTripId,
    ongoingCount,
    ongoingIds: ongoingTrips.map((t) => t.id),
    referencedTripId: referenced?.id ?? null,
    referencedStatus: referenced?.tripStatus ?? null,
  };

  if (ongoingCount > 1) {
    return failClosed(
      'CONFLICT_MULTIPLE_ONGOING',
      'More than one canonical ONGOING trip exists for vehicle',
      baseEvidence,
    );
  }

  if (input.fsmState === TripDetectionState.RESTING) {
    if (ongoingCount === 0) {
      return healthy('HEALTHY_RESTING', 'RESTING with no ONGOING trip', baseEvidence);
    }
    return failClosed(
      'CONFLICT_MISMATCH',
      'RESTING FSM cannot coexist with a canonical ONGOING trip',
      baseEvidence,
    );
  }

  if (input.fsmState === TripDetectionState.POSSIBLE_START) {
    if (ongoingCount === 0) {
      return healthy(
        'HEALTHY_POSSIBLE_START',
        'POSSIBLE_START with no committed ONGOING trip',
        baseEvidence,
      );
    }

    if (soleOngoing && provesStartEpisodeRelationship(soleOngoing, input)) {
      const classification = input.mergeTargetTripId
        ? 'RECOVERABLE_MERGE_ORPHAN'
        : 'RECOVERABLE_START_ORPHAN';
      return recoverable(
        classification,
        'ADOPT_ONGOING',
        soleOngoing.id,
        'Committed ONGOING trip matches current start episode',
        TripDetectionState.ACTIVE_TRIP,
        {
          ...baseEvidence,
          proof: 'start_episode',
          startTime: soleOngoing.startTime.toISOString(),
        },
      );
    }

    return failClosed(
      'CONFLICT_MISMATCH',
      'POSSIBLE_START with unrelated ONGOING trip — no durable proof relationship',
      baseEvidence,
    );
  }

  if (
    referenced &&
    (referenced.tripStatus === TripStatus.COMPLETED ||
      referenced.tripStatus === TripStatus.CANCELLED) &&
    ACTIVE_FSM_STATES.includes(input.fsmState)
  ) {
    if (ongoingCount === 0) {
      return recoverable(
        'RECOVERABLE_END_ORPHAN',
        'RESET_TO_RESTING',
        referenced.id,
        'FSM still active but referenced trip is terminal',
        TripDetectionState.RESTING,
        {
          ...baseEvidence,
          terminalStatus: referenced.tripStatus,
        },
      );
    }

    if (
      soleOngoing &&
      referenced.tripStatus === TripStatus.COMPLETED &&
      activeTripId === referenced.id &&
      readSplitFrom(soleOngoing.rawDetectionMeta) === referenced.id
    ) {
      return recoverable(
        'RECOVERABLE_SPLIT_REPOINT',
        'REPOINT_ACTIVE_TRIP',
        soleOngoing.id,
        'Mid-gap split continuation trip provably linked to completed first segment',
        TripDetectionState.ACTIVE_TRIP,
        {
          ...baseEvidence,
          splitFrom: referenced.id,
          continuationTripId: soleOngoing.id,
        },
      );
    }

    return failClosed(
      'CONFLICT_AMBIGUOUS',
      'Terminal referenced trip with additional ONGOING row — cannot prove safe repair',
      baseEvidence,
    );
  }

  if (
    !activeTripId &&
    soleOngoing &&
    ACTIVE_FSM_STATES.includes(input.fsmState)
  ) {
    if (provesActiveEpisodeRelationship(soleOngoing, input)) {
      return recoverable(
        'RECOVERABLE_MISSING_POINTER',
        'ADOPT_ONGOING',
        soleOngoing.id,
        'FSM missing activeTripId but one provably matching ONGOING exists',
        TripDetectionState.ACTIVE_TRIP,
        baseEvidence,
      );
    }

    return failClosed(
      'CONFLICT_AMBIGUOUS',
      'FSM missing activeTripId and ONGOING trip cannot be proven as current episode',
      baseEvidence,
    );
  }

  if (
    soleOngoing &&
    activeTripId &&
    activeTripId === soleOngoing.id &&
    ACTIVE_FSM_STATES.includes(input.fsmState)
  ) {
    return healthy(
      'HEALTHY',
      'FSM activeTripId matches sole canonical ONGOING trip',
      baseEvidence,
    );
  }

  if (
    soleOngoing &&
    activeTripId &&
    activeTripId !== soleOngoing.id &&
    ACTIVE_FSM_STATES.includes(input.fsmState)
  ) {
    return failClosed(
      'CONFLICT_MISMATCH',
      'FSM activeTripId does not match sole canonical ONGOING trip',
      baseEvidence,
    );
  }

  if (
    activeTripId &&
    referenced?.tripStatus === TripStatus.ONGOING &&
    referenced.id === activeTripId &&
    (!soleOngoing || soleOngoing.id === activeTripId)
  ) {
    return healthy(
      'HEALTHY',
      'FSM activeTripId references canonical ONGOING trip',
      baseEvidence,
    );
  }

  return failClosed(
    'CONFLICT_AMBIGUOUS',
    'Lifecycle invariant state is ambiguous — no safe automatic repair',
    baseEvidence,
  );
}
