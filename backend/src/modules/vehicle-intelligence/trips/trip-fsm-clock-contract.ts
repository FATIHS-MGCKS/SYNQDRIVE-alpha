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
  },
  workerNow: Date,
): Date {
  if (det.possibleEndEnteredAt) return det.possibleEndEnteredAt;
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
  det: { possibleEndAt?: Date | null },
  workerNow: Date,
): Date {
  return det.possibleEndAt ?? workerNow;
}

export function resolvePossibleEndBoundaryCandidate(params: {
  stopBoundaryAt?: Date | null;
  lastMeaningfulMovementAt?: Date | null;
  lastActivityAt?: Date | null;
  workerNow: Date;
}): { boundaryAt: Date; clockSource: TripFsmClockSource } {
  if (isValidProviderEventTimestamp(params.stopBoundaryAt, params.workerNow)) {
    return {
      boundaryAt: params.stopBoundaryAt!,
      clockSource: 'PROVIDER_EVENT_TIME',
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
