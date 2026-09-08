import {
  isValidProviderEventTimestamp,
  resolveOperationalNoCoreInactivityAnchor as resolveOperationalNoCoreInactivityAnchorLegacy,
} from './trip-fsm-clock-contract';
import type { EmptyCoreVlsTelemetry } from './trip-empty-core-end-gate';

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
