/**
 * SynqDrive — Event → Trip association contract (Stage 1).
 *
 * Canonical vocabulary shared by the resolver (intake path) and the
 * reconciliation paths (post-finalization hook + bounded safety net).
 */
import type { TripStatus } from '@prisma/client';

/**
 * Structured reason for an association decision. Used for logging, metrics
 * labels and diagnostics stored alongside unresolved candidates.
 *
 * Resolver outcomes:
 *   ACTIVE_TRIP_MATCH      — canonical `active_trip_id` from the detection FSM
 *   ONGOING_TRIP_MATCH     — single ONGOING trip, upper boundary treated as open
 *   FINALIZED_WINDOW_MATCH — single COMPLETED trip whose final window contains the event
 *   NO_TRIP_YET            — no eligible trip exists (yet) for this vehicle/timestamp
 *   AMBIGUOUS_TRIPS        — more than one plausible trip and nothing disambiguates
 *   CANCELLED_EXCLUDED     — the only temporal match was a CANCELLED trip
 *
 * Reconciliation outcomes:
 *   RECONCILED_ON_FINALIZATION — attached by the trip finalization hook
 *   RECONCILED_DELAYED         — attached by the bounded safety-net sweep
 */
export const EVENT_TRIP_ASSOCIATION_REASONS = {
  ACTIVE_TRIP_MATCH: 'ACTIVE_TRIP_MATCH',
  ONGOING_TRIP_MATCH: 'ONGOING_TRIP_MATCH',
  FINALIZED_WINDOW_MATCH: 'FINALIZED_WINDOW_MATCH',
  NO_TRIP_YET: 'NO_TRIP_YET',
  AMBIGUOUS_TRIPS: 'AMBIGUOUS_TRIPS',
  CANCELLED_EXCLUDED: 'CANCELLED_EXCLUDED',
  RECONCILED_ON_FINALIZATION: 'RECONCILED_ON_FINALIZATION',
  RECONCILED_DELAYED: 'RECONCILED_DELAYED',
} as const;

export type EventTripAssociationReason =
  (typeof EVENT_TRIP_ASSOCIATION_REASONS)[keyof typeof EVENT_TRIP_ASSOCIATION_REASONS];

/** Minimal trip projection the resolver needs. Keeps the domain DB-free. */
export interface TripAssociationCandidate {
  id: string;
  tripStatus: TripStatus;
  startTime: Date;
  /**
   * For ONGOING trips this is a *rolling activity cursor* written by the V2
   * tracking FSM roughly every 30s — NOT a finalized boundary. The resolver
   * must never treat it as an upper bound while the trip is open.
   *
   * For COMPLETED trips this is the canonical finalized end boundary.
   */
  endTime: Date | null;
}

export interface ResolveEventTripInput {
  observedAt: Date;
  /** Canonical `vehicle_trip_detection_states.active_trip_id`, when known. */
  activeTripId: string | null;
  /** Trips for the same vehicle with `startTime <= observedAt` (bounded slice). */
  trips: TripAssociationCandidate[];
}

export interface EventTripAssociationDecision {
  tripId: string | null;
  reason: EventTripAssociationReason;
  /** Trip ids that remained plausible — populated for AMBIGUOUS_TRIPS. */
  ambiguousTripIds?: string[];
  /** True when a CANCELLED trip matched temporally and was deliberately skipped. */
  cancelledExcluded?: boolean;
}

export interface EventTripReconciliationOutcome {
  scanned: number;
  associated: number;
  ambiguous: number;
  unresolved: number;
}
