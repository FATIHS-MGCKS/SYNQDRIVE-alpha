import {
  assessTrip,
  deriveTripAssessmentHasEnoughData,
  mapUnifiedEventsForAssessment,
} from './trip-assessment.service';
import type { TripAssessment, TripAssessmentEventInput } from './trip-assessment.types';
import type { TripEvidenceLevel } from './trip-evidence-level.types';
import type { CanonicalTripScoreSummary } from './trip-analytics-canonical.service';
import type { AnalysisAssessabilityContext } from './trip-analysis-status';
import type { UnifiedBehaviorEvent } from './unified-behavior-read-model';

import type { TripAttribution } from './trip-attribution.types';

export interface BuildTripAssessmentParams {
  unifiedEvents: UnifiedBehaviorEvent[];
  scores: CanonicalTripScoreSummary;
  misuseCaseCount: number;
  maxEvidenceLevel?: TripEvidenceLevel | null;
  distanceKm: number | null;
  durationMinutes: number | null;
  assessability: AnalysisAssessabilityContext;
  attribution?: TripAttribution | null;
}

export function buildTripAssessmentFromSignals(params: BuildTripAssessmentParams): TripAssessment {
  const unifiedEvents = mapUnifiedEventsForAssessment(params.unifiedEvents);
  const nativeEventCount = params.unifiedEvents.filter((event) => event.provenance === 'NATIVE').length;
  const reconstructedEventCount = params.unifiedEvents.length - nativeEventCount;
  const hasEnoughData = deriveTripAssessmentHasEnoughData({
    distanceKm: params.distanceKm,
    durationMinutes: params.durationMinutes,
    unifiedEventCount: params.unifiedEvents.length,
    nativeEventCount,
    drivingStressScore: params.scores.drivingStressScore,
    analysisAssessability: params.assessability.analysisAssessability,
  });

  return assessTrip({
    unifiedEvents,
    drivingStressScore: params.scores.drivingStressScore,
    drivingStressLevel: params.scores.stressLevel,
    misuseCaseCount: params.misuseCaseCount,
    maxEvidenceLevel: params.maxEvidenceLevel ?? undefined,
    hasEnoughData,
    distanceKm: params.distanceKm,
    durationMinutes: params.durationMinutes,
    nativeEventCount,
    reconstructedEventCount,
    deviceQualityDegraded:
      params.assessability.analysisLimitReason === 'DEVICE_NATIVE_EVENT_QUALITY',
    attributionNeedsReview: resolveAttributionNeedsReview(params.attribution),
    vehicleLoadNeedsReview: resolveVehicleLoadNeedsReview(
      params.scores.stressLevel,
      params.misuseCaseCount,
    ),
  });
}

function resolveAttributionNeedsReview(attribution?: TripAttribution | null): boolean {
  if (!attribution) return false;
  return (
    attribution.scope === 'BOOKING_TIME_WINDOW_MATCH' &&
    (attribution.customerRelevant || attribution.customerChargeable)
  );
}

function resolveVehicleLoadNeedsReview(
  stressLevel: CanonicalTripScoreSummary['stressLevel'],
  misuseCaseCount: number,
): boolean {
  if (misuseCaseCount === 0) return false;
  return stressLevel === 'high' || stressLevel === 'critical';
}

export function buildTripAssessmentFromEventInputs(input: {
  unifiedEvents: TripAssessmentEventInput[];
  drivingStressScore: number | null;
  drivingStressLevel: CanonicalTripScoreSummary['stressLevel'];
  misuseCaseCount: number;
  maxEvidenceLevel?: TripEvidenceLevel | null;
  hasEnoughData: boolean;
  distanceKm?: number | null;
  durationMinutes?: number | null;
  nativeEventCount?: number;
  reconstructedEventCount?: number;
}): TripAssessment {
  const nativeEventCount =
    input.nativeEventCount ??
    input.unifiedEvents.filter((event) => event.provenance === 'NATIVE').length;
  const reconstructedEventCount =
    input.reconstructedEventCount ?? input.unifiedEvents.length - nativeEventCount;

  return assessTrip({
    unifiedEvents: input.unifiedEvents,
    drivingStressScore: input.drivingStressScore,
    drivingStressLevel: input.drivingStressLevel,
    misuseCaseCount: input.misuseCaseCount,
    maxEvidenceLevel: input.maxEvidenceLevel ?? undefined,
    hasEnoughData: input.hasEnoughData,
    distanceKm: input.distanceKm ?? null,
    durationMinutes: input.durationMinutes ?? null,
    nativeEventCount,
    reconstructedEventCount,
  });
}
