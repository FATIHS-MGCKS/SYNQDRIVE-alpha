import {
  classifyStopBoundarySourceClockAuthority,
  isTrustedStopBoundaryAuthority,
  isValidProviderEventTimestamp,
  resolveOperationalNoCoreInactivityAnchor as resolveOperationalNoCoreInactivityAnchorLegacy,
  shouldReplaceStopBoundaryProvenance,
  type StopBoundaryClockAuthority,
  type StopBoundaryProvenance,
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

export function readStopBoundarySource(
  summary: TripFsmEvidenceSummary | null | undefined,
): string | null {
  return typeof summary?.stopBoundarySource === 'string'
    ? summary.stopBoundarySource
    : null;
}

export function readStopBoundaryClockAuthority(
  summary: TripFsmEvidenceSummary | null | undefined,
  source?: string | null,
): StopBoundaryClockAuthority {
  const raw = summary?.stopBoundaryClockAuthority;
  if (
    raw === 'PROVIDER_EVENT_TIME' ||
    raw === 'EVENT_TIME' ||
    raw === 'WORKER_TIME'
  ) {
    return raw;
  }
  const resolvedSource = source ?? readStopBoundarySource(summary);
  return classifyStopBoundarySourceClockAuthority(resolvedSource ?? 'unknown');
}

export function readStopBoundaryTrust(
  summary: TripFsmEvidenceSummary | null | undefined,
): boolean {
  if (typeof summary?.stopBoundaryTrust === 'boolean') {
    return summary.stopBoundaryTrust;
  }
  return isTrustedStopBoundaryAuthority(
    readStopBoundaryClockAuthority(summary),
  );
}

export function readStopBoundaryProvenance(
  summary: TripFsmEvidenceSummary | null | undefined,
): StopBoundaryProvenance | null {
  const boundaryAt = readStopBoundaryAt(summary);
  if (!boundaryAt) return null;
  const source = readStopBoundarySource(summary) ?? 'unknown';
  const clockAuthority = readStopBoundaryClockAuthority(summary, source);
  return {
    boundaryAt,
    source,
    clockAuthority,
    trust: readStopBoundaryTrust(summary),
  };
}

export function buildStopBoundaryProvenance(
  boundaryAt: Date,
  source: string,
  clockAuthority?: StopBoundaryClockAuthority,
): StopBoundaryProvenance {
  const authority = clockAuthority ?? classifyStopBoundarySourceClockAuthority(source);
  return {
    boundaryAt,
    source,
    clockAuthority: authority,
    trust: isTrustedStopBoundaryAuthority(authority),
  };
}

export function readStopBoundaryAt(
  summary: TripFsmEvidenceSummary | null | undefined,
): Date | null {
  return readIsoDate(summary, 'stopBoundaryAt');
}

/** Active end-candidacy boundary — cleared after credible post-boundary movement. */
export function readActiveStopBoundaryAt(
  summary: TripFsmEvidenceSummary | null | undefined,
): Date | null {
  return readStopBoundaryAt(summary);
}

export function readLastPauseBoundaryAt(
  summary: TripFsmEvidenceSummary | null | undefined,
): Date | null {
  return readIsoDate(summary, 'lastPauseBoundaryAt');
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
  maxFreshObservationAgeMs?: number;
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

  if (params.maxFreshObservationAgeMs != null) {
    const observationAgeMs = params.workerNow.getTime() - ts.getTime();
    if (observationAgeMs < 0 || observationAgeMs > params.maxFreshObservationAgeMs) {
      return null;
    }
  }

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
  existingStopBoundarySummary?: TripFsmEvidenceSummary | null;
  /** Fresh provider observation window for establishing a new active boundary. */
  maxFreshObservationAgeMs?: number;
}): ProviderStopBoundaryCandidate | null {
  const candidate = resolveStationaryIgnitionOffBoundary({
    telemetry: params.telemetry,
    profile: params.profile,
    workerNow: params.workerNow,
    lastMeaningfulMovementAt: params.lastMeaningfulMovementAt,
    maxFreshObservationAgeMs: params.maxFreshObservationAgeMs ?? 120_000,
  });
  if (!candidate) return null;

  const existing =
    readStopBoundaryProvenance(params.existingStopBoundarySummary) ??
    (params.existingStopBoundaryAt
      ? buildStopBoundaryProvenance(
          params.existingStopBoundaryAt,
          'legacy_unspecified',
        )
      : null);
  if (existing?.trust) {
    // Latch earliest trustworthy boundary for the same uninterrupted stop episode.
    return null;
  }

  return candidate;
}

export function mergeProviderStopBoundaryCandidate(
  prior: TripFsmEvidenceSummary | null | undefined,
  candidate: ProviderStopBoundaryCandidate,
): TripFsmEvidenceSummary {
  const provenance = buildStopBoundaryProvenance(
    candidate.boundaryAt,
    candidate.boundarySource,
    'PROVIDER_EVENT_TIME',
  );
  const next = mergeStopBoundaryProvenance(prior, provenance);
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
  maxFreshObservationAgeMs?: number;
}): StopBoundaryProvenance {
  if (
    params.movementEventAt &&
    isValidProviderEventTimestamp(params.movementEventAt, params.workerNow)
  ) {
    return buildStopBoundaryProvenance(
      params.movementEventAt,
      'idle_within_trip_movement',
      'EVENT_TIME',
    );
  }

  const stationary = resolveStationaryIgnitionOffBoundary({
    telemetry: params.telemetry,
    profile: params.profile,
    workerNow: params.workerNow,
    lastMeaningfulMovementAt: params.lastMeaningfulMovementAt,
    maxFreshObservationAgeMs: params.maxFreshObservationAgeMs,
  });
  if (stationary) {
    return buildStopBoundaryProvenance(
      stationary.boundaryAt,
      'idle_within_trip_stationary_vls',
      'PROVIDER_EVENT_TIME',
    );
  }

  if (
    params.lastMeaningfulMovementAt &&
    isValidProviderEventTimestamp(params.lastMeaningfulMovementAt, params.workerNow)
  ) {
    return buildStopBoundaryProvenance(
      params.lastMeaningfulMovementAt,
      'idle_within_trip_last_movement',
      'EVENT_TIME',
    );
  }

  if (
    params.lastActivityAt &&
    isValidProviderEventTimestamp(params.lastActivityAt, params.workerNow)
  ) {
    return buildStopBoundaryProvenance(
      params.lastActivityAt,
      'idle_within_trip_last_activity',
      'WORKER_TIME',
    );
  }

  return buildStopBoundaryProvenance(
    params.workerNow,
    'idle_within_trip_worker_now',
    'WORKER_TIME',
  );
}

export function mergeStopBoundaryProvenance(
  prior: TripFsmEvidenceSummary | null | undefined,
  incoming: StopBoundaryProvenance,
): TripFsmEvidenceSummary {
  const existing = readStopBoundaryProvenance(prior);
  if (existing && !shouldReplaceStopBoundaryProvenance(existing, incoming)) {
    return prior ?? {};
  }
  return {
    ...(prior ?? {}),
    stopBoundaryAt: incoming.boundaryAt.toISOString(),
    stopBoundarySource: incoming.source,
    stopBoundaryClockAuthority: incoming.clockAuthority,
    stopBoundaryTrust: incoming.trust,
  };
}

export function mergeStopBoundaryAt(
  prior: TripFsmEvidenceSummary | null | undefined,
  boundaryAt: Date,
  source: string,
  clockAuthority?: StopBoundaryClockAuthority,
): TripFsmEvidenceSummary {
  return mergeStopBoundaryProvenance(
    prior,
    buildStopBoundaryProvenance(boundaryAt, source, clockAuthority),
  );
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

/**
 * R12: after credible provider-time movement strictly after the active stop boundary,
 * retire it from end candidacy while preserving pause forensics.
 */
export function retireActiveStopBoundaryAfterMovement(
  prior: TripFsmEvidenceSummary | null | undefined,
  movementAt: Date,
): TripFsmEvidenceSummary {
  const active = readActiveStopBoundaryAt(prior);
  if (!active || movementAt.getTime() <= active.getTime()) {
    return prior ?? {};
  }

  const next: TripFsmEvidenceSummary = { ...(prior ?? {}) };
  next.lastPauseBoundaryAt = active.toISOString();
  if (typeof prior?.stopBoundarySource === 'string') {
    next.lastPauseBoundarySource = prior.stopBoundarySource;
  }
  if (typeof prior?.stopBoundaryClockAuthority === 'string') {
    next.lastPauseBoundaryClockAuthority = prior.stopBoundaryClockAuthority;
  }
  if (typeof prior?.stopBoundaryTrust === 'boolean') {
    next.lastPauseBoundaryTrust = prior.stopBoundaryTrust;
  }
  if (typeof prior?.stopBoundaryCandidateReason === 'string') {
    next.lastPauseBoundaryCandidateReason = prior.stopBoundaryCandidateReason;
  }
  next.stopBoundaryRetiredAt = movementAt.toISOString();
  next.stopBoundaryRetiredByMovementAt = movementAt.toISOString();

  delete next.stopBoundaryAt;
  delete next.stopBoundarySource;
  delete next.stopBoundaryClockAuthority;
  delete next.stopBoundaryTrust;
  delete next.stopBoundaryCandidateReason;
  delete next.stopBoundaryContradictions;
  delete next.stopBoundaryEvidenceState;

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
