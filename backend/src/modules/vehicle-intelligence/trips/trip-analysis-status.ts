/**
 * Canonical post-trip analysis status — single customer-facing semantics.
 *
 * Trip lifecycle (COMPLETED) and analysis pipeline are intentionally separate:
 * a trip may be finished while analysis is still running.
 */

export type TripAnalysisStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'PARTIAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED';

export type AnalysisStageName = 'behavior' | 'route' | 'misuse' | 'drivingImpact';

export type AnalysisStageState = 'pending' | 'done' | 'skipped' | 'failed';

export interface AnalysisStagesJson {
  behavior?: AnalysisStageState;
  route?: AnalysisStageState;
  misuse?: AnalysisStageState;
  drivingImpact?: AnalysisStageState;
}

export const TRIP_ANALYSIS_DISPLAY_LABEL: Record<TripAnalysisStatus, string> = {
  PENDING: 'Analyse läuft noch',
  IN_PROGRESS: 'Analyse läuft noch',
  PARTIAL: 'Analyse läuft noch',
  COMPLETED: 'Analyse abgeschlossen',
  FAILED: 'Analyse fehlgeschlagen',
  SKIPPED: 'Nicht genügend Daten',
};

export function getTripAnalysisDisplayLabel(
  status: TripAnalysisStatus | string | null | undefined,
): string | null {
  if (!status) return null;
  return TRIP_ANALYSIS_DISPLAY_LABEL[status as TripAnalysisStatus] ?? null;
}

export function isTripAnalysisInProgress(
  status: TripAnalysisStatus | string | null | undefined,
): boolean {
  return status === 'PENDING' || status === 'IN_PROGRESS' || status === 'PARTIAL';
}

export function mapAnalysisStatusToLegacySummaryStatus(
  status: TripAnalysisStatus,
): 'PENDING' | 'READY' | 'SKIPPED' | 'FAILED' {
  if (status === 'COMPLETED') return 'READY';
  if (status === 'SKIPPED') return 'SKIPPED';
  if (status === 'FAILED') return 'FAILED';
  return 'PENDING';
}

export function emptyAnalysisStages(): AnalysisStagesJson {
  return {
    behavior: 'pending',
    route: 'pending',
    misuse: 'pending',
    drivingImpact: 'pending',
  };
}

export function parseAnalysisStagesJson(value: unknown): AnalysisStagesJson {
  if (!value || typeof value !== 'object') return emptyAnalysisStages();
  const raw = value as Record<string, unknown>;
  const stage = (key: AnalysisStageName): AnalysisStageState | undefined => {
    const v = raw[key];
    if (v === 'pending' || v === 'done' || v === 'skipped' || v === 'failed') return v;
    return undefined;
  };
  return {
    behavior: stage('behavior') ?? 'pending',
    route: stage('route') ?? 'pending',
    misuse: stage('misuse') ?? 'pending',
    drivingImpact: stage('drivingImpact') ?? 'pending',
  };
}

function isStageTerminal(state: AnalysisStageState | undefined): boolean {
  return state === 'done' || state === 'skipped' || state === 'failed';
}

/** Whether all pipeline stages reached a terminal state suitable for COMPLETED. */
export function hasAnalysisStageFailure(stages: AnalysisStagesJson): boolean {
  return (
    stages.behavior === 'failed' ||
    stages.route === 'failed' ||
    stages.misuse === 'failed' ||
    stages.drivingImpact === 'failed'
  );
}

/** Whether all pipeline stages reached a terminal state suitable for COMPLETED. */
export function areAnalysisStagesComplete(stages: AnalysisStagesJson): boolean {
  if (hasAnalysisStageFailure(stages)) return false;
  return (
    stages.behavior === 'done' &&
    isStageTerminal(stages.route) &&
    isStageTerminal(stages.misuse) &&
    isStageTerminal(stages.drivingImpact)
  );
}

/** Behavior finished with usable output — misuse + driving impact may still run. */
export function isAnalysisPartiallyReady(stages: AnalysisStagesJson): boolean {
  return stages.behavior === 'done' && !areAnalysisStagesComplete(stages);
}

export interface TripAnalysisApiFields {
  tripAnalysisStatus: TripAnalysisStatus | null;
  tripAnalysisLabel: string | null;
  analysisInProgress: boolean;
  analysisQueuedAt: string | null;
  analysisStartedAt: string | null;
  analysisPartialAt: string | null;
  analysisCompletedAt: string | null;
  analysisFailedAt: string | null;
  analysisLatencyMs: number | null;
  totalAnalysisLatencyMs: number | null;
}

/**
 * Infer canonical analysis status for trips created before tripAnalysisStatus existed.
 * Avoids showing "Analyse läuft noch" for historical COMPLETED trips with finished enrichment.
 */
export function inferTripAnalysisStatusFromLegacy(trip: {
  tripStatus?: string | null;
  tripAnalysisStatus?: string | null;
  behaviorEnrichmentStatus?: string | null;
}): TripAnalysisStatus | null {
  if (trip.tripAnalysisStatus) {
    return trip.tripAnalysisStatus as TripAnalysisStatus;
  }
  if (trip.tripStatus !== 'COMPLETED') return null;

  const behavior = trip.behaviorEnrichmentStatus;
  if (!behavior) return 'PENDING';
  if (behavior === 'PENDING' || behavior === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (behavior === 'COMPLETED') return 'COMPLETED';
  if (behavior === 'SKIPPED_NO_HF_DATA') return 'SKIPPED';
  if (behavior === 'FAILED_PERMANENT' || behavior === 'FAILED_TRANSIENT') return 'FAILED';
  return null;
}

export function buildTripAnalysisApiFields(trip: {
  tripStatus?: string | null;
  tripAnalysisStatus?: string | null;
  behaviorEnrichmentStatus?: string | null;
  analysisQueuedAt?: Date | null;
  analysisStartedAt?: Date | null;
  analysisPartialAt?: Date | null;
  analysisCompletedAt?: Date | null;
  analysisFailedAt?: Date | null;
  analysisLatencyMs?: number | null;
}): TripAnalysisApiFields {
  const status = inferTripAnalysisStatusFromLegacy(trip);
  const latency = trip.analysisLatencyMs ?? null;
  return {
    tripAnalysisStatus: status,
    tripAnalysisLabel: getTripAnalysisDisplayLabel(status),
    analysisInProgress: isTripAnalysisInProgress(status),
    analysisQueuedAt: trip.analysisQueuedAt?.toISOString() ?? null,
    analysisStartedAt: trip.analysisStartedAt?.toISOString() ?? null,
    analysisPartialAt: trip.analysisPartialAt?.toISOString() ?? null,
    analysisCompletedAt: trip.analysisCompletedAt?.toISOString() ?? null,
    analysisFailedAt: trip.analysisFailedAt?.toISOString() ?? null,
    analysisLatencyMs: latency,
    totalAnalysisLatencyMs: latency,
  };
}
