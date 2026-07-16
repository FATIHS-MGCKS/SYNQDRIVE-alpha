import { createHash } from 'crypto';
import type { DrivingDetectorSupportStatus } from '../driving-detector-capability/driving-detector-capability.types';
import { SHADOW_DETECTOR_MAX_CONTEXT_CANDIDATES } from './shadow-detector.config';
import {
  SHADOW_DETECTOR_FRAMEWORK_VERSION,
  type ShadowCandidateEvent,
  type ShadowDetectorResult,
  type ShadowNativeEventComparison,
} from './shadow-detector.types';

const EXECUTABLE_SHADOW_STATUSES = new Set<DrivingDetectorSupportStatus>([
  'SHADOW',
  'CONTEXT_ONLY',
  'PROVIDER_DEPENDENT',
  'TEMPORARILY_DEGRADED',
]);

export function canExecuteShadowDetector(capabilityStatus: DrivingDetectorSupportStatus): boolean {
  return EXECUTABLE_SHADOW_STATUSES.has(capabilityStatus);
}

export function buildShadowDetectorIdempotencyKey(
  tripId: string,
  detectorId: string,
  modelVersion: string,
): string {
  return `shadow-detector:${tripId}:${detectorId}:${modelVersion}`;
}

export function buildShadowDetectorInputFingerprint(parts: string[]): string {
  return createHash('sha256').update(parts.sort().join('|')).digest('hex').slice(0, 16);
}

export function compareShadowCandidatesWithNativeEvents(input: {
  candidateEvents: readonly ShadowCandidateEvent[];
  nativeEvents: readonly { eventType: string; occurredAt: Date }[];
  windowSeconds: number;
}): ShadowNativeEventComparison {
  const windowMs = input.windowSeconds * 1000;
  const matchedNative = new Set<number>();
  let matchedWithinWindow = 0;

  for (const candidate of input.candidateEvents) {
    const candidateTs = new Date(candidate.occurredAt).getTime();
    const matchIdx = input.nativeEvents.findIndex((native, idx) => {
      if (matchedNative.has(idx)) return false;
      if (native.eventType !== candidate.eventType) return false;
      return Math.abs(native.occurredAt.getTime() - candidateTs) <= windowMs;
    });
    if (matchIdx >= 0) {
      matchedNative.add(matchIdx);
      matchedWithinWindow += 1;
    }
  }

  const nativeEventCount = input.nativeEvents.length;
  const shadowCandidateCount = input.candidateEvents.length;

  return {
    nativeEventCount,
    shadowCandidateCount,
    matchedWithinWindow,
    shadowOnlyCount: shadowCandidateCount - matchedWithinWindow,
    nativeOnlyCount: nativeEventCount - matchedWithinWindow,
    windowSeconds: input.windowSeconds,
  };
}

export function buildSkippedShadowResult(input: {
  detectorId: ShadowDetectorResult['detectorId'];
  modelVersion: string;
  capabilityStatus: DrivingDetectorSupportStatus;
  skipReason: string;
  rejectionReasons?: string[];
}): ShadowDetectorResult {
  return {
    detectorId: input.detectorId,
    modelVersion: input.modelVersion,
    capabilityStatus: input.capabilityStatus,
    assessability: 'NOT_ASSESSABLE',
    candidateEvents: [],
    context: { skipped: true, skipReason: input.skipReason },
    confidence: null,
    coverage: null,
    rejectionReasons: input.rejectionReasons ?? [input.skipReason],
    comparisonWithNativeEvents: null,
    skipped: true,
    skipReason: input.skipReason,
  };
}

export function buildShadowEvidenceContext(result: ShadowDetectorResult): Record<string, string | number | boolean | null> {
  const compactCandidates = result.candidateEvents
    .slice(0, SHADOW_DETECTOR_MAX_CONTEXT_CANDIDATES)
    .map((event) => ({
      t: event.eventType,
      at: event.occurredAt,
      s: event.severity ?? null,
    }));

  return {
    frameworkVersion: SHADOW_DETECTOR_FRAMEWORK_VERSION,
    detectorId: result.detectorId,
    modelVersion: result.modelVersion,
    capabilityStatus: result.capabilityStatus,
    assessability: result.assessability,
    skipped: result.skipped,
    skipReason: result.skipReason ?? null,
    candidateEventCount: result.candidateEvents.length,
    confidence: result.confidence,
    coverage: result.coverage,
    rejectionReasonCount: result.rejectionReasons.length,
    nativeEventCount: result.comparisonWithNativeEvents?.nativeEventCount ?? null,
    shadowOnlyCount: result.comparisonWithNativeEvents?.shadowOnlyCount ?? null,
    nativeOnlyCount: result.comparisonWithNativeEvents?.nativeOnlyCount ?? null,
    matchedWithinWindow: result.comparisonWithNativeEvents?.matchedWithinWindow ?? null,
    candidatePreview: JSON.stringify(compactCandidates),
    shadowMode: true,
    publicationBlocked: true,
  };
}

export function assertShadowResultIsolation(result: ShadowDetectorResult): void {
  if ((result.context as Record<string, unknown>)?.writesDrivingEvent === true) {
    throw new Error('Shadow detector results must not target DrivingEvent writes');
  }
  if ((result.context as Record<string, unknown>)?.opensMisuseCase === true) {
    throw new Error('Shadow detector results must not open misuse cases');
  }
  if ((result.context as Record<string, unknown>)?.customerDecision === true) {
    throw new Error('Shadow detector results must not affect customer decisions');
  }
}
