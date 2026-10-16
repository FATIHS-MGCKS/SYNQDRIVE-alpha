import { BatteryRestSessionStatus } from '@prisma/client';
import { TRIP_ASSOCIATION_ANCHOR_TOLERANCE_MS } from '../generalized-evidence/generalized-evidence.constants';

export type LvRestCanonicalTargetAnchorCandidate = {
  id: string;
  organizationId: string;
  vehicleId: string;
  anchorAt: Date;
  sessionStatus: BatteryRestSessionStatus;
  confirmedTripId?: string | null;
  candidateTripId?: string | null;
};

export type ResolveLvRestCanonicalTargetAnchorInput = {
  organizationId: string;
  vehicleId: string;
  measurementSessionStartedAt: Date;
  candidates: LvRestCanonicalTargetAnchorCandidate[];
  linkedTripId?: string | null;
  toleranceMs?: number;
};

export type ResolveLvRestCanonicalTargetAnchorResult =
  | {
      kind: 'SESSION_ANCHOR';
      restWindowStartedAt: Date;
      reason: 'no_match' | 'ambiguous' | 'ineligible_only';
    }
  | {
      kind: 'CANONICAL_REST_SESSION';
      restSessionId: string;
      restWindowStartedAt: Date;
      measurementSessionStartedAt: Date;
      anchorDeltaMs: number;
      association: 'confirmed_trip' | 'candidate_trip' | 'time_tolerance';
    };

/** REST target evaluation may bind ended sessions; never bind invalidated rows. */
/**
 * Max forward skew between LV measurement session `startedAt` and canonical
 * `anchorAt` observed in production forensics (G5C-N6). Used only to widen
 * reconciliation scan — binding still requires trip/time policy match.
 */
export const LV_REST_CANONICAL_MEASUREMENT_SESSION_SCHEDULE_SKEW_MS = 30 * 60_000;

export const LV_REST_TARGET_CANONICAL_SESSION_STATUSES: BatteryRestSessionStatus[] = [
  BatteryRestSessionStatus.CANDIDATE,
  BatteryRestSessionStatus.CONFIRMED,
  BatteryRestSessionStatus.RESTING,
  BatteryRestSessionStatus.ENDED,
];

export function isLvRestTargetCanonicalSessionEligible(
  status: BatteryRestSessionStatus,
): boolean {
  return LV_REST_TARGET_CANONICAL_SESSION_STATUSES.includes(status);
}

function isTenantScopedCandidate(
  candidate: LvRestCanonicalTargetAnchorCandidate,
  organizationId: string,
  vehicleId: string,
): boolean {
  return (
    candidate.organizationId === organizationId && candidate.vehicleId === vehicleId
  );
}

function filterEligibleCandidates(
  input: ResolveLvRestCanonicalTargetAnchorInput,
): LvRestCanonicalTargetAnchorCandidate[] {
  return input.candidates.filter(
    (candidate) =>
      isTenantScopedCandidate(candidate, input.organizationId, input.vehicleId) &&
      isLvRestTargetCanonicalSessionEligible(candidate.sessionStatus),
  );
}

function pickDeterministicByClosestAnchor(
  measurementSessionStartedAt: Date,
  scoped: LvRestCanonicalTargetAnchorCandidate[],
): LvRestCanonicalTargetAnchorCandidate | 'ambiguous' | null {
  if (scoped.length === 0) {
    return null;
  }
  const sessionMs = measurementSessionStartedAt.getTime();
  const ranked = scoped
    .map((candidate) => ({
      candidate,
      deltaMs: Math.abs(candidate.anchorAt.getTime() - sessionMs),
    }))
    .sort((a, b) => {
      if (a.deltaMs !== b.deltaMs) {
        return a.deltaMs - b.deltaMs;
      }
      return a.candidate.id.localeCompare(b.candidate.id);
    });

  const bestDelta = ranked[0].deltaMs;
  const tied = ranked.filter((row) => row.deltaMs === bestDelta);
  const distinctAnchors = new Set(
    tied.map((row) => row.candidate.anchorAt.getTime()),
  );
  if (distinctAnchors.size > 1) {
    return 'ambiguous';
  }
  return tied[0].candidate;
}

function resolveByLinkedTrip(
  input: ResolveLvRestCanonicalTargetAnchorInput,
  eligible: LvRestCanonicalTargetAnchorCandidate[],
): LvRestCanonicalTargetAnchorCandidate | 'ambiguous' | null {
  const linkedTripId = input.linkedTripId;
  if (!linkedTripId) {
    return null;
  }

  const tripScoped = eligible.filter((candidate) => {
    if (candidate.confirmedTripId) {
      return candidate.confirmedTripId === linkedTripId;
    }
    return candidate.candidateTripId === linkedTripId;
  });

  const confirmed = tripScoped.filter(
    (candidate) => candidate.confirmedTripId === linkedTripId,
  );
  if (confirmed.length > 1) {
    const distinctAnchors = new Set(confirmed.map((c) => c.anchorAt.getTime()));
    if (distinctAnchors.size > 1) {
      return 'ambiguous';
    }
  }
  if (confirmed.length === 1) {
    return confirmed[0];
  }

  const candidateOnly = tripScoped.filter(
    (row) =>
      !row.confirmedTripId && row.candidateTripId === linkedTripId,
  );
  if (candidateOnly.length > 1) {
    const distinctAnchors = new Set(candidateOnly.map((c) => c.anchorAt.getTime()));
    if (distinctAnchors.size > 1) {
      return 'ambiguous';
    }
  }
  if (candidateOnly.length === 1) {
    return candidateOnly[0];
  }

  return null;
}

function resolveByTimeTolerance(
  input: ResolveLvRestCanonicalTargetAnchorInput,
  eligible: LvRestCanonicalTargetAnchorCandidate[],
): LvRestCanonicalTargetAnchorCandidate | 'ambiguous' | null {
  const toleranceMs = input.toleranceMs ?? TRIP_ASSOCIATION_ANCHOR_TOLERANCE_MS;
  const sessionMs = input.measurementSessionStartedAt.getTime();

  const timeScoped = eligible.filter(
    (candidate) =>
      Math.abs(candidate.anchorAt.getTime() - sessionMs) <= toleranceMs,
  );

  const picked = pickDeterministicByClosestAnchor(
    input.measurementSessionStartedAt,
    timeScoped,
  );
  if (picked === 'ambiguous') {
    return 'ambiguous';
  }
  return picked;
}

/**
 * Binds LV_REST_WINDOW temporal targets to authoritative `battery_rest_sessions.anchorAt`.
 * Trip-linked measurement sessions never bind via unrelated temporal proximity.
 */
export function resolveLvRestCanonicalTargetAnchor(
  input: ResolveLvRestCanonicalTargetAnchorInput,
): ResolveLvRestCanonicalTargetAnchorResult {
  const eligible = filterEligibleCandidates(input);
  if (eligible.length === 0 && input.candidates.length > 0) {
    return {
      kind: 'SESSION_ANCHOR',
      restWindowStartedAt: input.measurementSessionStartedAt,
      reason: 'ineligible_only',
    };
  }

  let association: 'confirmed_trip' | 'candidate_trip' | 'time_tolerance' | null =
    null;
  let best: LvRestCanonicalTargetAnchorCandidate | null = null;

  if (input.linkedTripId) {
    const tripPick = resolveByLinkedTrip(input, eligible);
    if (tripPick === 'ambiguous') {
      return {
        kind: 'SESSION_ANCHOR',
        restWindowStartedAt: input.measurementSessionStartedAt,
        reason: 'ambiguous',
      };
    }
    if (tripPick) {
      best = tripPick;
      association =
        tripPick.confirmedTripId === input.linkedTripId
          ? 'confirmed_trip'
          : 'candidate_trip';
    }
  } else {
    const timePick = resolveByTimeTolerance(input, eligible);
    if (timePick === 'ambiguous') {
      return {
        kind: 'SESSION_ANCHOR',
        restWindowStartedAt: input.measurementSessionStartedAt,
        reason: 'ambiguous',
      };
    }
    if (timePick) {
      best = timePick;
      association = 'time_tolerance';
    }
  }

  if (!best || !association) {
    return {
      kind: 'SESSION_ANCHOR',
      restWindowStartedAt: input.measurementSessionStartedAt,
      reason: 'no_match',
    };
  }

  const sessionMs = input.measurementSessionStartedAt.getTime();
  const anchorDeltaMs = best.anchorAt.getTime() - sessionMs;

  return {
    kind: 'CANONICAL_REST_SESSION',
    restSessionId: best.id,
    restWindowStartedAt: best.anchorAt,
    measurementSessionStartedAt: input.measurementSessionStartedAt,
    anchorDeltaMs,
    association,
  };
}
