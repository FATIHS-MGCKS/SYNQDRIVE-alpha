/**
 * Trip FSM clock authority contract (R1).
 *
 * EVENT_TIME — provider/signal timestamps used for physical trip boundaries.
 * WORKER_TIME — FSM state entry, timeouts, retry scheduling, evaluation ticks.
 * DB_TIME — Prisma createdAt/updatedAt (operational metadata only).
 */
export const TRIP_FSM_MAX_FUTURE_SKEW_MS = 60_000;

export type TripFsmClockSource = 'PROVIDER_EVENT_TIME' | 'WORKER_FALLBACK';

export type TripFsmClockAuthority = 'EVENT_TIME' | 'WORKER_TIME' | 'DB_TIME';

/** R12: explicit stop-boundary clock authority (separate from FSM field authority). */
export type StopBoundaryClockAuthority =
  | 'PROVIDER_EVENT_TIME'
  | 'EVENT_TIME'
  | 'WORKER_TIME';

export type StopBoundaryProvenance = {
  boundaryAt: Date;
  source: string;
  clockAuthority: StopBoundaryClockAuthority;
  /** Trusted for boundary-backed provider silence and PROVIDER_EVENT_TIME end candidacy. */
  trust: boolean;
};

const STOP_BOUNDARY_SOURCE_CLOCK_AUTHORITY: Record<string, StopBoundaryClockAuthority> =
  {
    idle_within_trip_movement: 'EVENT_TIME',
    idle_within_trip_stationary_vls: 'PROVIDER_EVENT_TIME',
    provider_stationary_vls: 'PROVIDER_EVENT_TIME',
    idle_within_trip_last_movement: 'EVENT_TIME',
    idle_within_trip_last_activity: 'WORKER_TIME',
    idle_within_trip_worker_now: 'WORKER_TIME',
    pause_corroborated: 'PROVIDER_EVENT_TIME',
  };

const STOP_BOUNDARY_AUTHORITY_RANK: Record<StopBoundaryClockAuthority, number> = {
  WORKER_TIME: 0,
  EVENT_TIME: 1,
  PROVIDER_EVENT_TIME: 2,
};

export function classifyStopBoundarySourceClockAuthority(
  source: string,
): StopBoundaryClockAuthority {
  const mapped = STOP_BOUNDARY_SOURCE_CLOCK_AUTHORITY[source];
  if (mapped) return mapped;
  return 'WORKER_TIME';
}

export function isTrustedStopBoundaryAuthority(
  clockAuthority: StopBoundaryClockAuthority,
): boolean {
  return (
    clockAuthority === 'PROVIDER_EVENT_TIME' || clockAuthority === 'EVENT_TIME'
  );
}

/**
 * R12 stop-episode latch hierarchy:
 * PROVIDER_EVENT_TIME > EVENT_TIME > WORKER_TIME
 *
 * - Same authority within one stop episode: latch earliest — no forward slide.
 * - Stronger authority may replace weaker fallback (e.g. WORKER_TIME → provider VLS).
 * - Upgrades require explainable chronology (incoming boundary not before existing).
 * - Never replace an existing boundary with weaker authority.
 */
export function shouldReplaceStopBoundaryProvenance(
  existing: StopBoundaryProvenance,
  incoming: StopBoundaryProvenance,
): boolean {
  const existingRank = STOP_BOUNDARY_AUTHORITY_RANK[existing.clockAuthority];
  const incomingRank = STOP_BOUNDARY_AUTHORITY_RANK[incoming.clockAuthority];

  if (incomingRank > existingRank) {
    if (existing.clockAuthority === 'WORKER_TIME') return true;
    return incoming.boundaryAt.getTime() >= existing.boundaryAt.getTime();
  }
  if (incomingRank === existingRank) return false;
  return false;
}

export const TRIP_FSM_CLOCK_FIELDS = {
  possibleStartAt: 'EVENT_TIME' as TripFsmClockAuthority,
  possibleEndAt: 'EVENT_TIME' as TripFsmClockAuthority,
  possibleStartEnteredAt: 'WORKER_TIME' as TripFsmClockAuthority,
  possibleEndEnteredAt: 'WORKER_TIME' as TripFsmClockAuthority,
  lastMeaningfulMovementAt: 'EVENT_TIME' as TripFsmClockAuthority,
  /** Worker/evaluation timestamp — not equivalent to physical movement. */
  lastActivityAt: 'WORKER_TIME' as TripFsmClockAuthority,
} as const;

export function isValidProviderEventTimestamp(
  candidate: Date | null | undefined,
  workerNow: Date = new Date(),
  maxFutureSkewMs: number = TRIP_FSM_MAX_FUTURE_SKEW_MS,
): candidate is Date {
  if (!candidate) return false;
  const ms = candidate.getTime();
  if (!Number.isFinite(ms)) return false;
  if (ms > workerNow.getTime() + maxFutureSkewMs) return false;
  return true;
}

export function resolveStartCandidateClock(params: {
  providerSourceTimestamp: Date | null | undefined;
  workerNow: Date;
}): {
  candidateEventAt: Date;
  enteredAt: Date;
  clockSource: TripFsmClockSource;
} {
  const enteredAt = params.workerNow;
  if (isValidProviderEventTimestamp(params.providerSourceTimestamp, enteredAt)) {
    return {
      candidateEventAt: params.providerSourceTimestamp,
      enteredAt,
      clockSource: 'PROVIDER_EVENT_TIME',
    };
  }
  return {
    candidateEventAt: enteredAt,
    enteredAt,
    clockSource: 'WORKER_FALLBACK',
  };
}

/** FSM confirmation timeout / dwell anchor for POSSIBLE_START. */
export function resolvePossibleStartConfirmationAnchor(
  det: {
    possibleStartEnteredAt?: Date | null;
    possibleStartAt?: Date | null;
    updatedAt?: Date | null;
  },
  workerNow: Date,
): Date {
  if (det.possibleStartEnteredAt) return det.possibleStartEnteredAt;
  // Pre-R1 rows used possibleStartAt as the confirmation clock; prefer it over
  // mutable worker-lock bookkeeping on updatedAt.
  if (det.possibleStartAt) return det.possibleStartAt;
  if (det.updatedAt) return det.updatedAt;
  return workerNow;
}

/** FSM stability / dwell / hard-timeout anchor for POSSIBLE_END. */
export function resolvePossibleEndFsmDwellAnchor(
  det: {
    possibleEndEnteredAt?: Date | null;
    possibleEndAt?: Date | null;
    updatedAt?: Date | null;
    lastEvidenceSummary?: unknown;
  },
  workerNow: Date,
): Date {
  if (det.possibleEndEnteredAt) return det.possibleEndEnteredAt;
  const evidenceEntered = readPossibleEndDwellAnchorFromEvidence(
    det.lastEvidenceSummary,
  );
  if (evidenceEntered) return evidenceEntered;
  // Pre-R1 rows used possibleEndAt as the dwell clock; prefer it over updatedAt.
  if (det.possibleEndAt) return det.possibleEndAt;
  if (det.updatedAt) return det.updatedAt;
  return workerNow;
}

/**
 * Operational no-core inactivity gate (worker/evaluation semantics).
 * Separate from physical end-boundary candidate resolution.
 *
 * Prefers worker operational activity over provider event-time movement so
 * delayed evaluations do not inflate inactivity from backdated physical evidence.
 */
export function resolveOperationalNoCoreInactivityAnchor(params: {
  lastMeaningfulMovementAt?: Date | null;
  lastActivityAt?: Date | null;
  possibleStartAt?: Date | null;
  workerNow: Date;
}): Date {
  if (params.lastActivityAt) return params.lastActivityAt;
  if (params.lastMeaningfulMovementAt) return params.lastMeaningfulMovementAt;
  if (params.possibleStartAt) return params.possibleStartAt;
  return params.workerNow;
}

/** Event-based recovery: POSSIBLE_END stuck longer than threshold. */
export function isPossibleEndRecoveryEligible(
  det: {
    possibleEndEnteredAt?: Date | null;
    possibleEndAt?: Date | null;
    updatedAt?: Date | null;
    activeTripId?: string | null;
  },
  now: Date,
  thresholdMs: number,
): boolean {
  if (!det.activeTripId) return false;
  const recoveryAgeAnchor = resolvePossibleEndFsmDwellAnchor(det, now);
  return now.getTime() - recoveryAgeAnchor.getTime() > thresholdMs;
}

/** Physical end-boundary anchor for CUSUM windows and finalize priority. */
export function resolvePossibleEndBoundaryAnchor(
  det: {
    possibleEndAt?: Date | null;
    lastEvidenceSummary?: unknown;
  },
  workerNow: Date,
): Date {
  if (det.possibleEndAt) return det.possibleEndAt;
  const boundaryFromEvidence = readTrustedStopBoundaryFromEvidence(
    det.lastEvidenceSummary,
    workerNow,
  );
  if (boundaryFromEvidence) return boundaryFromEvidence;
  return workerNow;
}

function readEvidenceIsoDate(
  summary: unknown,
  key: string,
): Date | null {
  if (!summary || typeof summary !== 'object') return null;
  const raw = (summary as Record<string, unknown>)[key];
  if (typeof raw !== 'string') return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function readTrustedStopBoundaryFromEvidence(
  summary: unknown,
  workerNow: Date,
): Date | null {
  const boundaryAt = readEvidenceIsoDate(summary, 'stopBoundaryAt');
  if (!boundaryAt) return null;
  const trust =
    summary &&
    typeof summary === 'object' &&
    typeof (summary as Record<string, unknown>).stopBoundaryTrust === 'boolean'
      ? ((summary as Record<string, unknown>).stopBoundaryTrust as boolean)
      : true;
  if (!trust) return null;
  if (!isValidProviderEventTimestamp(boundaryAt, workerNow)) return null;
  return boundaryAt;
}

/** Worker-time FSM entry anchor persisted in evidence when DB column is missing. */
export function readPossibleEndEnteredAtFromEvidence(summary: unknown): Date | null {
  return readEvidenceIsoDate(summary, 'possibleEndEnteredAt');
}

/** Dwell anchor fallback — scheduled time is not the episode token but may anchor dwell. */
function readPossibleEndDwellAnchorFromEvidence(summary: unknown): Date | null {
  return (
    readPossibleEndEnteredAtFromEvidence(summary) ??
    readEvidenceIsoDate(summary, 'endValidationScheduledAt')
  );
}

/**
 * When modern R12 POSSIBLE_END row lost DB clock columns, restore from durable evidence.
 * Does not mutate evidence; returns Prisma patch fields only.
 */
export function reconcilePossibleEndClockColumns(params: {
  state: string;
  possibleEndAt?: Date | null;
  possibleEndEnteredAt?: Date | null;
  lastEvidenceSummary?: unknown;
  workerNow: Date;
}): {
  possibleEndAt?: Date;
  possibleEndEnteredAt?: Date;
} | null {
  if (params.state !== 'POSSIBLE_END') return null;
  const summary = params.lastEvidenceSummary;
  const patch: { possibleEndAt?: Date; possibleEndEnteredAt?: Date } = {};
  if (!params.possibleEndAt) {
    const boundary = readTrustedStopBoundaryFromEvidence(summary, params.workerNow);
    if (boundary) patch.possibleEndAt = boundary;
  }
  if (!params.possibleEndEnteredAt) {
    const entered =
      readPossibleEndEnteredAtFromEvidence(summary) ??
      (params.possibleEndAt ? null : patch.possibleEndAt ? params.workerNow : null);
    if (entered) patch.possibleEndEnteredAt = entered;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

export function resolvePossibleEndBoundaryCandidate(params: {
  stopBoundaryProvenance?: StopBoundaryProvenance | null;
  stopBoundaryAt?: Date | null;
  stopBoundarySource?: string | null;
  stopBoundaryClockAuthority?: StopBoundaryClockAuthority | null;
  stopBoundaryTrust?: boolean | null;
  lastMeaningfulMovementAt?: Date | null;
  lastActivityAt?: Date | null;
  workerNow: Date;
}): { boundaryAt: Date; clockSource: TripFsmClockSource } {
  const provenance =
    params.stopBoundaryProvenance ??
    (params.stopBoundaryAt
      ? {
          boundaryAt: params.stopBoundaryAt,
          source: params.stopBoundarySource ?? 'legacy_unspecified',
          clockAuthority:
            params.stopBoundaryClockAuthority ??
            classifyStopBoundarySourceClockAuthority(
              params.stopBoundarySource ?? 'legacy_unspecified',
            ),
          trust:
            params.stopBoundaryTrust ??
            isTrustedStopBoundaryAuthority(
              params.stopBoundaryClockAuthority ??
                classifyStopBoundarySourceClockAuthority(
                  params.stopBoundarySource ?? 'legacy_unspecified',
                ),
            ),
        }
      : null);

  if (
    provenance?.trust &&
    isValidProviderEventTimestamp(provenance.boundaryAt, params.workerNow)
  ) {
    return {
      boundaryAt: provenance.boundaryAt,
      clockSource:
        provenance.clockAuthority === 'WORKER_TIME'
          ? 'WORKER_FALLBACK'
          : 'PROVIDER_EVENT_TIME',
    };
  }

  if (
    isValidProviderEventTimestamp(params.lastMeaningfulMovementAt, params.workerNow)
  ) {
    return {
      boundaryAt: params.lastMeaningfulMovementAt!,
      clockSource: 'PROVIDER_EVENT_TIME',
    };
  }
  if (params.lastActivityAt) {
    return {
      boundaryAt: params.lastActivityAt,
      clockSource: 'WORKER_FALLBACK',
    };
  }
  return {
    boundaryAt: params.workerNow,
    clockSource: 'WORKER_FALLBACK',
  };
}

export function clearPossibleStartClockFields(): {
  possibleStartAt: null;
  possibleStartEnteredAt: null;
} {
  return {
    possibleStartAt: null,
    possibleStartEnteredAt: null,
  };
}

export function clearPossibleEndClockFields(): {
  possibleEndAt: null;
  possibleEndEnteredAt: null;
} {
  return {
    possibleEndAt: null,
    possibleEndEnteredAt: null,
  };
}
