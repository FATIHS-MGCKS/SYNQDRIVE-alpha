import {
  isValidProviderEventTimestamp,
  resolveOperationalNoCoreInactivityAnchor as resolveOperationalNoCoreInactivityAnchorLegacy,
} from './trip-fsm-clock-contract';
import type { EmptyCoreVlsTelemetry } from './trip-empty-core-end-gate';
import { getSharedSignalThresholds } from './trip-start-detection-policy';

export type TripFsmEvidenceSummary = Record<string, unknown>;

export function readIsoDate(
  summary: TripFsmEvidenceSummary | null | undefined,
  key: string,
): Date | null {
  const raw = summary?.[key];
  if (typeof raw !== 'string') return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function readStopBoundaryAt(
  summary: TripFsmEvidenceSummary | null | undefined,
): Date | null {
  return readIsoDate(summary, 'stopBoundaryAt');
}

export function readPauseDetectedAt(
  summary: TripFsmEvidenceSummary | null | undefined,
): Date | null {
  return readIsoDate(summary, 'pauseDetectedAt');
}

export function readLastProviderActivityAt(
  summary: TripFsmEvidenceSummary | null | undefined,
): Date | null {
  return readIsoDate(summary, 'lastProviderActivityAt');
}

export function readEmptyCoreDeferralStreak(
  summary: TripFsmEvidenceSummary | null | undefined,
): number {
  const raw = summary?.emptyCoreDeferralStreak;
  return typeof raw === 'number' && raw > 0 ? raw : 0;
}

/**
 * Provider-time operational silence anchor for empty-core gate.
 * Prefers explicit provider activity, then meaningful movement, then legacy anchor.
 */
export function resolveProviderOperationalAnchor(params: {
  lastEvidenceSummary?: TripFsmEvidenceSummary | null;
  lastMeaningfulMovementAt?: Date | null;
  lastActivityAt?: Date | null;
  possibleStartAt?: Date | null;
  workerNow: Date;
}): { anchorAt: Date; anchorSource: string } {
  const summary = params.lastEvidenceSummary ?? null;
  const providerActivity = readLastProviderActivityAt(summary);
  if (isValidProviderEventTimestamp(providerActivity, params.workerNow)) {
    return { anchorAt: providerActivity!, anchorSource: 'lastProviderActivityAt' };
  }
  if (
    isValidProviderEventTimestamp(params.lastMeaningfulMovementAt, params.workerNow)
  ) {
    return {
      anchorAt: params.lastMeaningfulMovementAt!,
      anchorSource: 'lastMeaningfulMovementAt',
    };
  }
  const legacy = resolveOperationalNoCoreInactivityAnchorLegacy({
    lastMeaningfulMovementAt: params.lastMeaningfulMovementAt,
    lastActivityAt: params.lastActivityAt,
    possibleStartAt: params.possibleStartAt,
    workerNow: params.workerNow,
  });
  return {
    anchorAt: legacy,
    anchorSource: params.lastActivityAt
      ? 'lastActivityAt_legacy'
      : params.lastMeaningfulMovementAt
        ? 'lastMeaningfulMovementAt_legacy'
        : 'possibleStartAt_or_workerNow',
  };
}

/**
 * Resolve stop boundary when entering IDLE_WITHIN_TRIP.
 * Prefers post-movement stationary VLS provider time when ignition is explicitly OFF.
 * Ignition ON or unknown does not qualify as shutdown evidence for boundary anchoring.
 */
export function resolveStationaryIgnitionOffBoundary(params: {
  telemetry: EmptyCoreVlsTelemetry | null;
  profile: string;
  workerNow: Date;
  lastMeaningfulMovementAt: Date | null;
}): {
  boundaryAt: Date;
  boundarySource: string;
  candidateReason: string;
  contradictions: string[];
  evidenceState: 'STRONG' | 'QUALIFIED';
} | null {
  const shared = getSharedSignalThresholds(params.profile);
  const ts = params.telemetry?.sourceTimestamp ?? null;
  const speed = params.telemetry?.speedKmh;

  if (
    !ts ||
    !isValidProviderEventTimestamp(ts, params.workerNow) ||
    speed == null ||
    speed > shared.speedMotionKmh ||
    params.telemetry?.isIgnitionOn !== false
  ) {
    return null;
  }

  const afterLastMove =
    !params.lastMeaningfulMovementAt ||
    ts.getTime() >= params.lastMeaningfulMovementAt.getTime();
  if (!afterLastMove) return null;

  const contradictions: string[] = [];
  const load = params.telemetry?.engineLoad;
  if (load != null && load > 15) {
    contradictions.push('engine_load_at_standstill');
  }

  return {
    boundaryAt: ts,
    boundarySource: 'provider_stationary_vls',
    candidateReason:
      contradictions.length > 0
        ? 'stationary_ignition_off_qualified'
        : 'stationary_ignition_off_strong',
    contradictions,
    evidenceState: contradictions.length > 0 ? 'QUALIFIED' : 'STRONG',
  };
}

export type ProviderStopBoundaryCandidate = NonNullable<
  ReturnType<typeof resolveStationaryIgnitionOffBoundary>
>;

/**
 * R12: provider-time stop boundary candidate while trip remains ACTIVE_TRIP / IDLE.
 * Does not finalize or split — observation only.
 */
export function resolveProviderStopBoundaryCandidate(params: {
  telemetry: EmptyCoreVlsTelemetry | null;
  profile: string;
  workerNow: Date;
  lastMeaningfulMovementAt: Date | null;
  existingStopBoundaryAt?: Date | null;
}): ProviderStopBoundaryCandidate | null {
  const candidate = resolveStationaryIgnitionOffBoundary({
    telemetry: params.telemetry,
    profile: params.profile,
    workerNow: params.workerNow,
    lastMeaningfulMovementAt: params.lastMeaningfulMovementAt,
  });
  if (!candidate) return null;

  const existing = params.existingStopBoundaryAt;
  if (existing && existing.getTime() >= candidate.boundaryAt.getTime()) {
    return null;
  }

  return candidate;
}

export function mergeProviderStopBoundaryCandidate(
  prior: TripFsmEvidenceSummary | null | undefined,
  candidate: ProviderStopBoundaryCandidate,
): TripFsmEvidenceSummary {
  const next = mergeStopBoundaryAt(
    prior,
    candidate.boundaryAt,
    candidate.boundarySource,
  );
  return {
    ...next,
    stopBoundaryCandidateReason: candidate.candidateReason,
    stopBoundaryContradictions: candidate.contradictions,
    stopBoundaryEvidenceState: candidate.evidenceState,
  };
}

export function resolveIdleStopBoundaryAt(params: {
  movementEventAt: Date | null;
  lastMeaningfulMovementAt: Date | null;
  lastActivityAt: Date | null;
  workerNow: Date;
  telemetry: EmptyCoreVlsTelemetry | null;
  profile: string;
}): { boundaryAt: Date; boundarySource: string } {
  if (
    params.movementEventAt &&
    isValidProviderEventTimestamp(params.movementEventAt, params.workerNow)
  ) {
    return {
      boundaryAt: params.movementEventAt,
      boundarySource: 'idle_within_trip_movement',
    };
  }

  const stationary = resolveStationaryIgnitionOffBoundary({
    telemetry: params.telemetry,
    profile: params.profile,
    workerNow: params.workerNow,
    lastMeaningfulMovementAt: params.lastMeaningfulMovementAt,
  });
  if (stationary) {
    return {
      boundaryAt: stationary.boundaryAt,
      boundarySource: 'idle_within_trip_stationary_vls',
    };
  }

  if (
    params.lastMeaningfulMovementAt &&
    isValidProviderEventTimestamp(params.lastMeaningfulMovementAt, params.workerNow)
  ) {
    return {
      boundaryAt: params.lastMeaningfulMovementAt,
      boundarySource: 'idle_within_trip_last_movement',
    };
  }

  if (
    params.lastActivityAt &&
    isValidProviderEventTimestamp(params.lastActivityAt, params.workerNow)
  ) {
    return {
      boundaryAt: params.lastActivityAt,
      boundarySource: 'idle_within_trip_last_activity',
    };
  }

  return {
    boundaryAt: params.workerNow,
    boundarySource: 'idle_within_trip_worker_now',
  };
}

export function mergeStopBoundaryAt(
  prior: TripFsmEvidenceSummary | null | undefined,
  boundaryAt: Date,
  source: string,
): TripFsmEvidenceSummary {
  const existing = readStopBoundaryAt(prior);
  if (existing && existing.getTime() >= boundaryAt.getTime()) {
    return prior ?? {};
  }
  return {
    ...(prior ?? {}),
    stopBoundaryAt: boundaryAt.toISOString(),
    stopBoundarySource: source,
  };
}

export function mergePauseDetectedAt(
  prior: TripFsmEvidenceSummary | null | undefined,
  pauseAt: Date,
  source: string,
): TripFsmEvidenceSummary {
  if (readPauseDetectedAt(prior)) return prior ?? {};
  return {
    ...(prior ?? {}),
    pauseDetectedAt: pauseAt.toISOString(),
    pauseDetectedSource: source,
  };
}

export function mergeLastProviderActivityAt(
  prior: TripFsmEvidenceSummary | null | undefined,
  activityAt: Date,
): TripFsmEvidenceSummary {
  const existing = readLastProviderActivityAt(prior);
  if (existing && existing.getTime() >= activityAt.getTime()) {
    return prior ?? {};
  }
  return {
    ...(prior ?? {}),
    lastProviderActivityAt: activityAt.toISOString(),
  };
}

export function mergeEmptyCoreDeferral(
  prior: TripFsmEvidenceSummary | null | undefined,
  params: {
    streak: number;
    nextCheckDelayMs: number;
    innerGateReason: string;
  },
): TripFsmEvidenceSummary {
  return {
    ...(prior ?? {}),
    emptyCoreDeferralStreak: params.streak,
    emptyCoreNextCheckDelayMs: params.nextCheckDelayMs,
    innerGateReason: params.innerGateReason,
  };
}

export function clearPauseEvidence(
  prior: TripFsmEvidenceSummary | null | undefined,
): TripFsmEvidenceSummary {
  const next = { ...(prior ?? {}) };
  delete next.pauseDetectedAt;
  delete next.pauseDetectedSource;
  delete next.emptyCoreDeferralStreak;
  delete next.emptyCoreNextCheckDelayMs;
  return next;
}

/** Motor-off pause corroboration: fresh INACTIVE VLS or ignition-off in core. */
export function isPauseCorroborated(params: {
  telemetry: EmptyCoreVlsTelemetry | null;
  workerNow: Date;
  maxObservationAgeMs: number;
  operationalInactiveMs: number;
  minEndInactivityMs: number;
}): boolean {
  if (params.operationalInactiveMs <= 0) return false;
  if (params.operationalInactiveMs >= params.minEndInactivityMs) return false;
  if (!params.telemetry?.sourceTimestamp) return false;
  const ageMs =
    params.workerNow.getTime() - params.telemetry.sourceTimestamp.getTime();
  if (ageMs < 0 || ageMs > params.maxObservationAgeMs) return false;
  if (params.telemetry.speedKmh == null) return false;
  if (params.telemetry.speedKmh > 0.5) return false;
  const load = params.telemetry.engineLoad;
  if (load != null && load > 15) return false;
  if (params.telemetry.isIgnitionOn === true) return false;
  return true;
}
