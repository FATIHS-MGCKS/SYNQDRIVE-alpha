import { TRIP_ASSOCIATION_ANCHOR_TOLERANCE_MS } from '../generalized-evidence/generalized-evidence.constants';

export type LvRestCanonicalTargetAnchorCandidate = {
  id: string;
  organizationId: string;
  vehicleId: string;
  anchorAt: Date;
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
    }
  | {
      kind: 'CANONICAL_REST_SESSION';
      restSessionId: string;
      restWindowStartedAt: Date;
      measurementSessionStartedAt: Date;
      anchorDeltaMs: number;
    };

/**
 * Binds LV_REST_WINDOW temporal targets to authoritative `battery_rest_sessions.anchorAt`
 * when a canonical rest session exists within trip/rest association tolerance.
 * Never promotes generalized-evidence candidates — only shifts evaluation windows.
 */
function isTenantScopedCandidate(
  candidate: LvRestCanonicalTargetAnchorCandidate,
  organizationId: string,
  vehicleId: string,
): boolean {
  return (
    candidate.organizationId === organizationId && candidate.vehicleId === vehicleId
  );
}

function pickCanonicalCandidate(
  input: ResolveLvRestCanonicalTargetAnchorInput,
  scoped: LvRestCanonicalTargetAnchorCandidate[],
): LvRestCanonicalTargetAnchorCandidate | null {
  if (scoped.length === 0) {
    return null;
  }
  const sessionMs = input.measurementSessionStartedAt.getTime();
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
  return ranked[0].candidate;
}

export function resolveLvRestCanonicalTargetAnchor(
  input: ResolveLvRestCanonicalTargetAnchorInput,
): ResolveLvRestCanonicalTargetAnchorResult {
  const toleranceMs = input.toleranceMs ?? TRIP_ASSOCIATION_ANCHOR_TOLERANCE_MS;
  const sessionMs = input.measurementSessionStartedAt.getTime();

  const timeScoped = input.candidates.filter(
    (candidate) =>
      isTenantScopedCandidate(candidate, input.organizationId, input.vehicleId) &&
      Math.abs(candidate.anchorAt.getTime() - sessionMs) <= toleranceMs,
  );

  let best = pickCanonicalCandidate(input, timeScoped);

  if (!best && input.linkedTripId) {
    const tripScoped = input.candidates.filter(
      (candidate) =>
        isTenantScopedCandidate(candidate, input.organizationId, input.vehicleId) &&
        (candidate.confirmedTripId === input.linkedTripId ||
          candidate.candidateTripId === input.linkedTripId),
    );
    const confirmed = tripScoped.filter(
      (candidate) => candidate.confirmedTripId === input.linkedTripId,
    );
    best = pickCanonicalCandidate(
      input,
      confirmed.length > 0 ? confirmed : tripScoped,
    );
  }

  if (!best) {
    return {
      kind: 'SESSION_ANCHOR',
      restWindowStartedAt: input.measurementSessionStartedAt,
    };
  }

  const anchorDeltaMs = best.anchorAt.getTime() - sessionMs;

  return {
    kind: 'CANONICAL_REST_SESSION',
    restSessionId: best.id,
    restWindowStartedAt: best.anchorAt,
    measurementSessionStartedAt: input.measurementSessionStartedAt,
    anchorDeltaMs,
  };
}
