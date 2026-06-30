/**
 * API DTOs for the unified trip behaviour read-model.
 *
 * Serializes internal `UnifiedBehaviorEvent` rows into a stable JSON contract for
 * the frontend. Context assessment is first-class; legacy ingest snapshots
 * (rpm/throttle/coolant at event time) are exposed separately so the UI can
 * prefer context-window stats over point-in-time legacy values.
 */

import type { EventContextAssessment } from '../event-context/event-context-assessment.types';
import type { UnifiedBehaviorEvent } from './unified-behavior-read-model';

/** Legacy point-in-time values from native event ingest — not the T±30s context window. */
export interface TripBehaviorEventLegacyIngestEvidenceDto {
  rpm: number | null;
  throttlePct: number | null;
  coolantC: number | null;
}

/** Convenience flattening of the most-used context signal stats for consumers. */
export interface TripBehaviorEventContextKeyValuesDto {
  preSpeed: number | null;
  postSpeed: number | null;
  maxSpeed: number | null;
  maxRpm: number | null;
  maxThrottle: number | null;
  maxEngineLoad: number | null;
  coolantAtEvent: number | null;
  coolantMin: number | null;
  coolantMax: number | null;
}

/** Per-signal stats surfaced on the API (mirrors persisted assessment). */
export interface TripBehaviorEventContextSignalStatsDto {
  signal?: string;
  count?: number;
  nonNullCount?: number;
  min?: number | null;
  max?: number | null;
  avg?: number | null;
  valueBeforeAnchor?: number | null;
  valueAfterAnchor?: number | null;
  nearestValueToAnchor?: number | null;
  coverageQuality?: string;
  [key: string]: unknown;
}

/** Full context assessment contract for trip behaviour event detail. */
export interface TripBehaviorEventContextAssessmentDto {
  version: number;
  status: EventContextAssessment['status'];
  anchorType: EventContextAssessment['anchorType'];
  originalEventName: string | null;
  dimoEventName: string | null;
  anchorEvent?: EventContextAssessment['anchorEvent'];
  anchorTimestamp: string;
  windowStart: string;
  windowEnd: string;
  engineSignalsApplicable: boolean;
  engineOnHint: boolean | null;
  classifications: EventContextAssessment['classifications'];
  preliminaryClassifications: EventContextAssessment['preliminaryClassifications'];
  confidence: EventContextAssessment['confidence'];
  evidenceGrade: EventContextAssessment['evidenceGrade'];
  reasonCodes: EventContextAssessment['reasonCodes'];
  usedSignals: EventContextAssessment['usedSignals'];
  missingSignals: EventContextAssessment['missingSignals'];
  signalCoverage: EventContextAssessment['signalCoverage'];
  dataQuality: EventContextAssessment['dataQuality'];
  speedContext: TripBehaviorEventContextSignalStatsDto;
  rpmContext: TripBehaviorEventContextSignalStatsDto;
  throttleContext: TripBehaviorEventContextSignalStatsDto;
  engineLoadContext: TripBehaviorEventContextSignalStatsDto;
  coolantContext: TripBehaviorEventContextSignalStatsDto;
  keyValues: TripBehaviorEventContextKeyValuesDto;
  generatedAt: string;
  error?: string | null;
}

export interface UnifiedBehaviorEventDto {
  id: string;
  organizationId: string | null;
  vehicleId: string;
  tripId: string;
  eventCategory: string;
  eventType: string;
  classification: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  startSpeedKmh: number | null;
  endSpeedKmh: number | null;
  peakValue: number | null;
  peakValueUnit: string | null;
  peakG: number | null;
  maxThrottlePos: number | null;
  maxEngineRpm: number | null;
  maxCoolantTemp: number | null;
  latitude: number | null;
  longitude: number | null;
  metadataJson: unknown;
  createdAt: string;
  source: UnifiedBehaviorEvent['source'];
  provenance: UnifiedBehaviorEvent['provenance'];
  detectionMethod: string;
  confidence: UnifiedBehaviorEvent['confidence'];
  requiredSignals: string[];
  originalEventName: string | null;
  originalEventSource: string | null;
  contextAssessment: TripBehaviorEventContextAssessmentDto | null;
  legacyIngestEvidence: TripBehaviorEventLegacyIngestEvidenceDto | null;
  abuseRelevant: boolean;
  abuseCategory: string | null;
  abuseReason: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function asSignalStats(value: unknown): TripBehaviorEventContextSignalStatsDto {
  return isRecord(value) ? (value as TripBehaviorEventContextSignalStatsDto) : {};
}

export function extractContextKeyValues(
  assessment: {
    speedContext?: TripBehaviorEventContextSignalStatsDto;
    rpmContext?: TripBehaviorEventContextSignalStatsDto;
    throttleContext?: TripBehaviorEventContextSignalStatsDto;
    engineLoadContext?: TripBehaviorEventContextSignalStatsDto;
    coolantContext?: TripBehaviorEventContextSignalStatsDto;
  },
): TripBehaviorEventContextKeyValuesDto {
  return {
    preSpeed: assessment.speedContext?.valueBeforeAnchor ?? null,
    postSpeed: assessment.speedContext?.valueAfterAnchor ?? null,
    maxSpeed: assessment.speedContext?.max ?? null,
    maxRpm: assessment.rpmContext?.max ?? null,
    maxThrottle: assessment.throttleContext?.max ?? null,
    maxEngineLoad: assessment.engineLoadContext?.max ?? null,
    coolantAtEvent: assessment.coolantContext?.nearestValueToAnchor ?? null,
    coolantMin: assessment.coolantContext?.min ?? null,
    coolantMax: assessment.coolantContext?.max ?? null,
  };
}

/**
 * Normalize a persisted `metadataJson.contextAssessment` blob into the API DTO.
 * Returns null when absent or not a structured assessment object.
 */
export function normalizeContextAssessmentForDto(
  raw: unknown,
  originalEventName: string | null,
): TripBehaviorEventContextAssessmentDto | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.status !== 'string' || typeof raw.anchorTimestamp !== 'string') {
    return null;
  }

  const dimoEventName =
    typeof raw.dimoEventName === 'string'
      ? raw.dimoEventName
      : originalEventName;

  const preliminary = Array.isArray(raw.preliminaryClassifications)
    ? (raw.preliminaryClassifications as EventContextAssessment['preliminaryClassifications'])
    : [];
  const classifications = Array.isArray(raw.classifications)
    ? (raw.classifications as EventContextAssessment['classifications'])
    : preliminary;

  const speedContext = asSignalStats(raw.speedContext);
  const rpmContext = asSignalStats(raw.rpmContext);
  const throttleContext = asSignalStats(raw.throttleContext);
  const engineLoadContext = asSignalStats(raw.engineLoadContext);
  const coolantContext = asSignalStats(raw.coolantContext);

  const partialAssessment = {
    speedContext,
    rpmContext,
    throttleContext,
    engineLoadContext,
    coolantContext,
  };

  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    status: raw.status as EventContextAssessment['status'],
    anchorType: (raw.anchorType ??
      'DIMO_NATIVE_BEHAVIOR_EVENT') as EventContextAssessment['anchorType'],
    originalEventName: dimoEventName,
    dimoEventName,
    anchorEvent: isRecord(raw.anchorEvent)
      ? (raw.anchorEvent as unknown as EventContextAssessment['anchorEvent'])
      : null,
    anchorTimestamp: raw.anchorTimestamp,
    windowStart: typeof raw.windowStart === 'string' ? raw.windowStart : raw.anchorTimestamp,
    windowEnd: typeof raw.windowEnd === 'string' ? raw.windowEnd : raw.anchorTimestamp,
    engineSignalsApplicable: raw.engineSignalsApplicable === true,
    engineOnHint:
      typeof raw.engineOnHint === 'boolean' ? raw.engineOnHint : null,
    classifications,
    preliminaryClassifications: preliminary,
    confidence: (raw.confidence ?? 'INSUFFICIENT') as EventContextAssessment['confidence'],
    evidenceGrade: (raw.evidenceGrade ?? 'D') as EventContextAssessment['evidenceGrade'],
    reasonCodes: Array.isArray(raw.reasonCodes)
      ? (raw.reasonCodes as EventContextAssessment['reasonCodes'])
      : [],
    usedSignals: Array.isArray(raw.usedSignals)
      ? (raw.usedSignals as EventContextAssessment['usedSignals'])
      : [],
    missingSignals: Array.isArray(raw.missingSignals)
      ? (raw.missingSignals as EventContextAssessment['missingSignals'])
      : [],
    signalCoverage: Array.isArray(raw.signalCoverage)
      ? (raw.signalCoverage as EventContextAssessment['signalCoverage'])
      : [],
    dataQuality: isRecord(raw.dataQuality)
      ? (raw.dataQuality as unknown as EventContextAssessment['dataQuality'])
      : {
          sampleCount: 0,
          medianIntervalMs: null,
          p95IntervalMs: null,
          maxGapMs: null,
          nearestSampleToAnchorMs: null,
          coverage: [],
        },
    speedContext,
    rpmContext,
    throttleContext,
    engineLoadContext,
    coolantContext,
    keyValues: extractContextKeyValues(partialAssessment),
    generatedAt:
      typeof raw.generatedAt === 'string' ? raw.generatedAt : raw.anchorTimestamp,
    error: typeof raw.error === 'string' ? raw.error : null,
  };
}

export function serializeUnifiedBehaviorEvent(
  event: UnifiedBehaviorEvent,
): UnifiedBehaviorEventDto {
  return {
    id: event.id,
    organizationId: event.organizationId,
    vehicleId: event.vehicleId,
    tripId: event.tripId,
    eventCategory: event.eventCategory,
    eventType: event.eventType,
    classification: event.classification,
    startedAt: event.startedAt.toISOString(),
    endedAt: event.endedAt ? event.endedAt.toISOString() : null,
    durationMs: event.durationMs,
    startSpeedKmh: event.startSpeedKmh,
    endSpeedKmh: event.endSpeedKmh,
    peakValue: event.peakValue,
    peakValueUnit: event.peakValueUnit,
    peakG: event.peakG,
    maxThrottlePos: event.maxThrottlePos,
    maxEngineRpm: event.maxEngineRpm,
    maxCoolantTemp: event.maxCoolantTemp,
    latitude: event.latitude,
    longitude: event.longitude,
    metadataJson: event.metadataJson,
    createdAt: event.createdAt.toISOString(),
    source: event.source,
    provenance: event.provenance,
    detectionMethod: event.detectionMethod,
    confidence: event.confidence,
    requiredSignals: event.requiredSignals,
    originalEventName: event.originalEventName,
    originalEventSource: event.originalEventSource,
    contextAssessment: normalizeContextAssessmentForDto(
      event.contextAssessment,
      event.originalEventName,
    ),
    legacyIngestEvidence: event.legacyIngestEvidence,
    abuseRelevant: event.abuseRelevant,
    abuseCategory: event.abuseCategory,
    abuseReason: event.abuseReason,
  };
}
