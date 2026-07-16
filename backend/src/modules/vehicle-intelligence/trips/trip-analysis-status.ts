/**
 * Canonical post-trip analysis status — single customer-facing semantics.
 *
 * Trip lifecycle (COMPLETED) and analysis pipeline are intentionally separate:
 * a trip may be finished while analysis is still running.
 */

import {
  resolveTripAnalysisStatus,
} from './trip-analysis-status-resolver';
import type { TripAnalysisStageRuntimeState, TripAnalysisStageSnapshot } from './trip-analysis-status-resolver.types';
import {
  emptyAnalysisStagesDocument,
  flattenStageStates,
  parseAnalysisStagesDocument,
  type AnalysisStagesDocument,
} from './trip-analysis-stage-record';

export type { AnalysisStagesDocument, AnalysisStageRecord } from './trip-analysis-stage-record';
export {
  emptyAnalysisStagesDocument,
  flattenStageStates,
  getStageRecord,
  getStageState,
  parseAnalysisStagesDocument,
  updateStageRecord,
} from './trip-analysis-stage-record';

export type TripAnalysisStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'PARTIAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED';

export type AnalysisStageName =
  | 'behavior'
  | 'nativeEvents'
  | 'route'
  | 'eventContext'
  | 'misuse'
  | 'drivingImpact'
  | 'attribution';

export type AnalysisStageState = 'pending' | 'done' | 'skipped' | 'failed' | 'not_assessable';

export type AnalysisAssessability = 'FULL' | 'LIMITED' | 'NOT_ASSESSABLE';

export type AnalysisLimitReason =
  | 'INSUFFICIENT_HF'
  | 'NO_NATIVE_EVENTS'
  | 'LOW_DATA'
  | 'CAPABILITY'
  | 'NO_END_TIME'
  | 'DEVICE_NATIVE_EVENT_QUALITY';

export interface AnalysisAssessabilityContext {
  analysisAssessability: AnalysisAssessability;
  analysisLimitReason: AnalysisLimitReason | null;
  shortTermMisuseAssessable: boolean;
  nativeBehaviorEventsAvailable: boolean;
  hfInsufficientForAbuse: boolean;
  nativeEventCount?: number;
  hfPointsTotal?: number;
  hfPointsCleaned?: number;
  hardwareType?: string;
}

export interface AnalysisStagesJson {
  behavior?: AnalysisStageState;
  nativeEvents?: AnalysisStageState;
  route?: AnalysisStageState;
  eventContext?: AnalysisStageState;
  misuse?: AnalysisStageState;
  drivingImpact?: AnalysisStageState;
  attribution?: AnalysisStageState;
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
  return flattenStageStates(emptyAnalysisStagesDocument()) as AnalysisStagesJson;
}

const ANALYSIS_STAGE_JSON_KEYS: AnalysisStageName[] = [
  'behavior',
  'nativeEvents',
  'route',
  'eventContext',
  'misuse',
  'drivingImpact',
  'attribution',
];

export function parseAnalysisStagesJson(value: unknown): AnalysisStagesJson {
  return flattenStageStates(parseAnalysisStagesDocument(value)) as AnalysisStagesJson;
}

function isStageTerminal(state: AnalysisStageState | undefined): boolean {
  return (
    state === 'done' ||
    state === 'skipped' ||
    state === 'failed' ||
    state === 'not_assessable'
  );
}

/** Whether all pipeline stages reached a terminal state suitable for COMPLETED. */
export function areAnalysisStagesComplete(stages: AnalysisStagesJson): boolean {
  return resolveTripAnalysisStatusFromStages(stages).status === 'COMPLETED';
}

/** Whether any pipeline stage failed. */
export function hasAnalysisStageFailure(stages: AnalysisStagesJson): boolean {
  return resolveTripAnalysisStatusFromStages(stages).failedStages.length > 0;
}

/** Behavior finished with usable output — misuse + driving impact may still run. */
export function isAnalysisPartiallyReady(stages: AnalysisStagesJson): boolean {
  const resolved = resolveTripAnalysisStatusFromStages(stages);
  return resolved.status === 'PARTIAL';
}

/** Behavior stage reached a terminal state (done or skipped). */
export function isBehaviorStageTerminal(stages: AnalysisStagesJson): boolean {
  return stages.behavior === 'done' || stages.behavior === 'skipped' || stages.behavior === 'failed';
}

export function parseBehaviorSummaryJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readBoolean(summary: Record<string, unknown>, key: string): boolean | undefined {
  const v = summary[key];
  if (typeof v === 'boolean') return v;
  return undefined;
}

function readNumber(summary: Record<string, unknown>, key: string): number | undefined {
  const v = summary[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return undefined;
}

function readString(summary: Record<string, unknown>, key: string): string | undefined {
  const v = summary[key];
  if (typeof v === 'string') return v;
  return undefined;
}

function isValidAssessability(v: string | undefined): v is AnalysisAssessability {
  return v === 'FULL' || v === 'LIMITED' || v === 'NOT_ASSESSABLE';
}

function isValidLimitReason(v: string | undefined): v is AnalysisLimitReason {
  return (
    v === 'INSUFFICIENT_HF' ||
    v === 'NO_NATIVE_EVENTS' ||
    v === 'LOW_DATA' ||
    v === 'CAPABILITY' ||
    v === 'NO_END_TIME' ||
    v === 'DEVICE_NATIVE_EVENT_QUALITY'
  );
}

/**
 * Derive assessability from persisted behaviorSummaryJson + trip metadata.
 * Prefers explicit persisted flags when present (written by enrichment/coordinator).
 */
export function deriveAnalysisAssessability(trip: {
  hardwareType?: string | null;
  qualityStatus?: string | null;
  behaviorEnrichmentStatus?: string | null;
  behaviorSummaryJson?: unknown;
  tripAnalysisStatus?: string | null;
}): AnalysisAssessabilityContext {
  const summary = parseBehaviorSummaryJson(trip.behaviorSummaryJson);
  const persistedAssess = readString(summary, 'analysisAssessability');
  const persistedReason = readString(summary, 'analysisLimitReason');
  const hfInsufficient =
    readBoolean(summary, 'hfInsufficientForAbuse') ??
    (trip.behaviorEnrichmentStatus === 'SKIPPED_NO_HF_DATA');
  const nativeAvailable =
    readBoolean(summary, 'nativeBehaviorEventsAvailable') ??
    (readNumber(summary, 'nativeEventCount') ?? 0) > 0;
  const nativeEventCount = readNumber(summary, 'nativeEventCount');
  const hfPointsTotal = readNumber(summary, 'hfPointsTotal');
  const hfPointsCleaned = readNumber(summary, 'hfPointsCleaned');

  if (isValidAssessability(persistedAssess)) {
    const nativeQuerySucceeded = readBoolean(summary, 'nativeQuerySucceeded') === true;
    const deviceQualityWarning = readBoolean(summary, 'deviceQualityWarning') === true;
    const reconciledCalmLteR1 =
      persistedAssess === 'NOT_ASSESSABLE' &&
      persistedReason === 'NO_NATIVE_EVENTS' &&
      nativeQuerySucceeded &&
      (nativeEventCount ?? 0) === 0 &&
      !hfInsufficient;

    if (reconciledCalmLteR1) {
      return buildAssessabilityForLteR1Completed({
        nativeEventCount: 0,
        nativeQuerySucceeded: true,
        hfInsufficientForAbuse: false,
        hfPointsTotal: hfPointsTotal ?? 0,
        hfPointsCleaned: hfPointsCleaned ?? 0,
        hardwareType: trip.hardwareType ?? readString(summary, 'hardwareType') ?? undefined,
      });
    }

    if (deviceQualityWarning) {
      return {
        analysisAssessability: 'LIMITED',
        analysisLimitReason: 'DEVICE_NATIVE_EVENT_QUALITY',
        shortTermMisuseAssessable: readBoolean(summary, 'shortTermMisuseAssessable') ?? !hfInsufficient,
        nativeBehaviorEventsAvailable: nativeAvailable,
        hfInsufficientForAbuse: hfInsufficient,
        nativeEventCount,
        hfPointsTotal,
        hfPointsCleaned,
        hardwareType: trip.hardwareType ?? readString(summary, 'hardwareType'),
      };
    }

    return {
      analysisAssessability: persistedAssess,
      analysisLimitReason: isValidLimitReason(persistedReason) ? persistedReason : null,
      shortTermMisuseAssessable:
        readBoolean(summary, 'shortTermMisuseAssessable') ?? !hfInsufficient,
      nativeBehaviorEventsAvailable: nativeAvailable,
      hfInsufficientForAbuse: hfInsufficient,
      nativeEventCount,
      hfPointsTotal,
      hfPointsCleaned,
      hardwareType: trip.hardwareType ?? readString(summary, 'hardwareType'),
    };
  }

  if (trip.qualityStatus === 'LOW_DATA' || trip.qualityStatus === 'ANOMALY') {
    return {
      analysisAssessability: 'LIMITED',
      analysisLimitReason: 'LOW_DATA',
      shortTermMisuseAssessable: false,
      nativeBehaviorEventsAvailable: nativeAvailable,
      hfInsufficientForAbuse: hfInsufficient,
      nativeEventCount,
      hfPointsTotal,
      hfPointsCleaned,
      hardwareType: trip.hardwareType ?? undefined,
    };
  }

  if (trip.behaviorEnrichmentStatus === 'SKIPPED_NO_HF_DATA') {
    return {
      analysisAssessability: 'NOT_ASSESSABLE',
      analysisLimitReason: 'INSUFFICIENT_HF',
      shortTermMisuseAssessable: false,
      nativeBehaviorEventsAvailable: false,
      hfInsufficientForAbuse: true,
      nativeEventCount: 0,
      hfPointsTotal,
      hfPointsCleaned,
      hardwareType: trip.hardwareType ?? undefined,
    };
  }

  if (nativeAvailable && hfInsufficient) {
    return {
      analysisAssessability: 'LIMITED',
      analysisLimitReason: 'INSUFFICIENT_HF',
      shortTermMisuseAssessable: false,
      nativeBehaviorEventsAvailable: true,
      hfInsufficientForAbuse: true,
      nativeEventCount,
      hfPointsTotal,
      hfPointsCleaned,
      hardwareType: trip.hardwareType ?? undefined,
    };
  }

  if (trip.behaviorEnrichmentStatus === 'COMPLETED') {
    return {
      analysisAssessability: nativeAvailable || !hfInsufficient ? 'FULL' : 'NOT_ASSESSABLE',
      analysisLimitReason: nativeAvailable ? null : 'NO_NATIVE_EVENTS',
      shortTermMisuseAssessable: !hfInsufficient,
      nativeBehaviorEventsAvailable: nativeAvailable,
      hfInsufficientForAbuse: hfInsufficient,
      nativeEventCount,
      hfPointsTotal,
      hfPointsCleaned,
      hardwareType: trip.hardwareType ?? undefined,
    };
  }

  return {
    analysisAssessability: 'NOT_ASSESSABLE',
    analysisLimitReason: null,
    shortTermMisuseAssessable: false,
    nativeBehaviorEventsAvailable: nativeAvailable,
    hfInsufficientForAbuse: hfInsufficient,
    nativeEventCount,
    hfPointsTotal,
    hfPointsCleaned,
    hardwareType: trip.hardwareType ?? undefined,
  };
}

export function buildAssessabilityForSmart5Skip(
  reason: 'CAPABILITY' | 'INSUFFICIENT_POINTS' | 'NO_HF_DATA',
  hardwareType?: string,
  hfPointsTotal = 0,
  hfPointsCleaned = 0,
): AnalysisAssessabilityContext {
  switch (reason) {
    case 'CAPABILITY':
      return {
        analysisAssessability: 'NOT_ASSESSABLE',
        analysisLimitReason: 'CAPABILITY',
        shortTermMisuseAssessable: false,
        nativeBehaviorEventsAvailable: false,
        hfInsufficientForAbuse: true,
        nativeEventCount: 0,
        hfPointsTotal,
        hfPointsCleaned,
        hardwareType,
      };
    case 'NO_HF_DATA':
      return {
        analysisAssessability: 'NOT_ASSESSABLE',
        analysisLimitReason: 'NO_END_TIME',
        shortTermMisuseAssessable: false,
        nativeBehaviorEventsAvailable: false,
        hfInsufficientForAbuse: true,
        nativeEventCount: 0,
        hfPointsTotal,
        hfPointsCleaned,
        hardwareType,
      };
    case 'INSUFFICIENT_POINTS':
      return {
        analysisAssessability: 'NOT_ASSESSABLE',
        analysisLimitReason: 'INSUFFICIENT_HF',
        shortTermMisuseAssessable: false,
        nativeBehaviorEventsAvailable: false,
        hfInsufficientForAbuse: true,
        nativeEventCount: 0,
        hfPointsTotal,
        hfPointsCleaned,
        hardwareType,
      };
  }
}

export function buildAssessabilityForSmart5Completed(params: {
  hfPointsTotal: number;
  hfPointsCleaned: number;
  hardwareType?: string;
}): AnalysisAssessabilityContext {
  return {
    analysisAssessability: 'FULL',
    analysisLimitReason: null,
    shortTermMisuseAssessable: true,
    nativeBehaviorEventsAvailable: false,
    hfInsufficientForAbuse: false,
    nativeEventCount: 0,
    hfPointsTotal: params.hfPointsTotal,
    hfPointsCleaned: params.hfPointsCleaned,
    hardwareType: params.hardwareType,
  };
}

export function buildAssessabilityForLteR1Completed(params: {
  nativeEventCount: number;
  nativeQuerySucceeded: boolean;
  hfInsufficientForAbuse: boolean;
  hfPointsTotal: number;
  hfPointsCleaned: number;
  hardwareType?: string;
}): AnalysisAssessabilityContext {
  const nativeBehaviorEventsAvailable = params.nativeEventCount > 0;

  if (nativeBehaviorEventsAvailable) {
    if (params.hfInsufficientForAbuse) {
      return {
        analysisAssessability: 'LIMITED',
        analysisLimitReason: 'INSUFFICIENT_HF',
        shortTermMisuseAssessable: false,
        nativeBehaviorEventsAvailable: true,
        hfInsufficientForAbuse: true,
        nativeEventCount: params.nativeEventCount,
        hfPointsTotal: params.hfPointsTotal,
        hfPointsCleaned: params.hfPointsCleaned,
        hardwareType: params.hardwareType,
      };
    }
    return {
      analysisAssessability: 'FULL',
      analysisLimitReason: null,
      shortTermMisuseAssessable: true,
      nativeBehaviorEventsAvailable: true,
      hfInsufficientForAbuse: false,
      nativeEventCount: params.nativeEventCount,
      hfPointsTotal: params.hfPointsTotal,
      hfPointsCleaned: params.hfPointsCleaned,
      hardwareType: params.hardwareType,
    };
  }

  if (params.nativeQuerySucceeded) {
    // Native DIMO query succeeded with zero events: the absence of harsh events
    // is itself a reliable signal on LTE_R1 when HF quality is sufficient.
    if (!params.hfInsufficientForAbuse) {
      return {
        analysisAssessability: 'FULL',
        analysisLimitReason: null,
        shortTermMisuseAssessable: true,
        nativeBehaviorEventsAvailable: false,
        hfInsufficientForAbuse: false,
        nativeEventCount: 0,
        hfPointsTotal: params.hfPointsTotal,
        hfPointsCleaned: params.hfPointsCleaned,
        hardwareType: params.hardwareType,
      };
    }
    return {
      analysisAssessability: 'NOT_ASSESSABLE',
      analysisLimitReason: 'NO_NATIVE_EVENTS',
      shortTermMisuseAssessable: false,
      nativeBehaviorEventsAvailable: false,
      hfInsufficientForAbuse: true,
      nativeEventCount: 0,
      hfPointsTotal: params.hfPointsTotal,
      hfPointsCleaned: params.hfPointsCleaned,
      hardwareType: params.hardwareType,
    };
  }

  return {
    analysisAssessability: params.hfInsufficientForAbuse ? 'NOT_ASSESSABLE' : 'LIMITED',
    analysisLimitReason: params.hfInsufficientForAbuse ? 'INSUFFICIENT_HF' : 'NO_NATIVE_EVENTS',
    shortTermMisuseAssessable: !params.hfInsufficientForAbuse,
    nativeBehaviorEventsAvailable: false,
    hfInsufficientForAbuse: params.hfInsufficientForAbuse,
    nativeEventCount: 0,
    hfPointsTotal: params.hfPointsTotal,
    hfPointsCleaned: params.hfPointsCleaned,
    hardwareType: params.hardwareType,
  };
}

/** Merge assessability flags into behaviorSummaryJson for API consumers. */
export function mergeAssessabilityIntoSummary(
  summary: Record<string, unknown>,
  ctx: AnalysisAssessabilityContext,
): Record<string, unknown> {
  return {
    ...summary,
    analysisAssessability: ctx.analysisAssessability,
    analysisLimitReason: ctx.analysisLimitReason,
    shortTermMisuseAssessable: ctx.shortTermMisuseAssessable,
    nativeBehaviorEventsAvailable: ctx.nativeBehaviorEventsAvailable,
    hfInsufficientForAbuse: ctx.hfInsufficientForAbuse,
    nativeEventCount: ctx.nativeEventCount ?? summary.nativeEventCount,
    hfPointsTotal: ctx.hfPointsTotal ?? summary.hfPointsTotal,
    hfPointsCleaned: ctx.hfPointsCleaned ?? summary.hfPointsCleaned,
    hardwareType: ctx.hardwareType ?? summary.hardwareType,
  };
}

export function isTripDetailsLimited(trip: {
  endTime?: Date | string | null;
  qualityStatus?: string | null;
  tripAnalysisStatus?: string | null;
  behaviorEnrichmentStatus?: string | null;
  behaviorSummaryJson?: unknown;
}): boolean {
  const assess = deriveAnalysisAssessability(trip);
  return (
    !trip.endTime ||
    trip.qualityStatus === 'LOW_DATA' ||
    trip.qualityStatus === 'ANOMALY' ||
    trip.tripAnalysisStatus === 'SKIPPED' ||
    trip.behaviorEnrichmentStatus === 'SKIPPED_NO_HF_DATA' ||
    assess.analysisAssessability === 'LIMITED' ||
    assess.analysisAssessability === 'NOT_ASSESSABLE' ||
    assess.hfInsufficientForAbuse === true
  );
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
  analysisAssessability: AnalysisAssessability | null;
  analysisLimitReason: AnalysisLimitReason | null;
  shortTermMisuseAssessable: boolean;
  nativeBehaviorEventsAvailable: boolean;
  hfInsufficientForAbuse: boolean;
  nativeEventCount: number | null;
  hfPointsTotal: number | null;
  hfPointsCleaned: number | null;
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
  qualityStatus?: string | null;
  hardwareType?: string | null;
  behaviorSummaryJson?: unknown;
  analysisQueuedAt?: Date | null;
  analysisStartedAt?: Date | null;
  analysisPartialAt?: Date | null;
  analysisCompletedAt?: Date | null;
  analysisFailedAt?: Date | null;
  analysisLatencyMs?: number | null;
}): TripAnalysisApiFields {
  const status = inferTripAnalysisStatusFromLegacy(trip);
  const latency = trip.analysisLatencyMs ?? null;
  const assess = deriveAnalysisAssessability(trip);

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
    analysisAssessability: assess.analysisAssessability,
    analysisLimitReason: assess.analysisLimitReason,
    shortTermMisuseAssessable: assess.shortTermMisuseAssessable,
    nativeBehaviorEventsAvailable: assess.nativeBehaviorEventsAvailable,
    hfInsufficientForAbuse: assess.hfInsufficientForAbuse,
    nativeEventCount: assess.nativeEventCount ?? null,
    hfPointsTotal: assess.hfPointsTotal ?? null,
    hfPointsCleaned: assess.hfPointsCleaned ?? null,
  };
}

/** Whether the entire analysis should be SKIPPED (no assessable source at all). */
export function shouldFullySkipAnalysis(ctx: AnalysisAssessabilityContext): boolean {
  return (
    ctx.analysisAssessability === 'NOT_ASSESSABLE' &&
    !ctx.nativeBehaviorEventsAvailable &&
    ctx.hfInsufficientForAbuse
  );
}

function mapPersistedStageState(
  state: AnalysisStageState | undefined,
  fallback?: AnalysisStageState,
): TripAnalysisStageRuntimeState {
  const resolved = state ?? fallback;
  if (!resolved) return 'not_started';
  if (resolved === 'pending') return 'pending';
  if (resolved === 'done') return 'done';
  if (resolved === 'skipped' || resolved === 'not_assessable') return 'skipped';
  return 'failed';
}

/** Build resolver input snapshot from persisted `analysisStagesJson`. */
export function buildStageSnapshotFromJson(stages: AnalysisStagesJson): TripAnalysisStageSnapshot {
  return {
    behavior: mapPersistedStageState(stages.behavior),
    nativeEvents: mapPersistedStageState(stages.nativeEvents, stages.behavior),
    route: mapPersistedStageState(stages.route),
    eventContext: mapPersistedStageState(stages.eventContext, stages.behavior),
    drivingImpact: mapPersistedStageState(stages.drivingImpact),
    misuse: mapPersistedStageState(stages.misuse),
    attribution: mapPersistedStageState(stages.attribution),
  };
}

/** Central status resolution from persisted stages (flat or enriched document). */
export function resolveTripAnalysisStatusFromStages(
  stages: AnalysisStagesJson | AnalysisStagesDocument | unknown,
  options?: {
    assessability?: AnalysisAssessabilityContext;
    analysisQueued?: boolean;
  },
) {
  const flat = flattenStageStates(parseAnalysisStagesDocument(stages));

  const assessability =
    options?.assessability ??
    ({
      analysisAssessability: 'FULL',
      analysisLimitReason: null,
      shortTermMisuseAssessable: true,
      nativeBehaviorEventsAvailable: flat.behavior === 'done',
      hfInsufficientForAbuse: false,
    } satisfies AnalysisAssessabilityContext);

  const analysisQueued =
    options?.analysisQueued ??
    (flat.behavior !== 'pending' ||
      flat.route !== 'pending' ||
      flat.misuse !== 'pending' ||
      flat.drivingImpact !== 'pending');

  return resolveTripAnalysisStatus({
    stages: buildStageSnapshotFromJson(flat),
    assessability,
    analysisQueued,
  });
}
