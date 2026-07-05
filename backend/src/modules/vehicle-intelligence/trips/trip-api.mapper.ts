import {
  buildTripAnalysisApiFields,
  deriveAnalysisAssessability,
  isTripDetailsLimited,
  parseBehaviorSummaryJson,
} from './trip-analysis-status';

/** Strip internal enrichment fields and attach canonical trip analysis API surface. */
export function mapTripForVehicleApi(
  trip: Record<string, unknown> & {
    behaviorEnrichmentStatus?: string | null;
    behaviorEnrichmentError?: string | null;
    behaviorEnrichmentAttempts?: number | null;
    behaviorSummaryJson?: unknown;
    tripStatus?: string | null;
    tripAnalysisStatus?: string | null;
    endTime?: Date | string | null;
    qualityStatus?: string | null;
    hardwareType?: string | null;
    canonicalTripSummary?: {
      scores?: { drivingStressScore?: number | null; stressLevel?: string | null; scoreSource?: string };
      events?: Record<string, number | undefined>;
      assignment?: Record<string, unknown>;
    };
    drivingScore?: number | null;
  },
) {
  const {
    behaviorEnrichmentStatus,
    behaviorEnrichmentError: _behaviorEnrichmentError,
    behaviorEnrichmentAttempts: _behaviorEnrichmentAttempts,
    analysisStagesJson: _analysisStagesJson,
    analysisFailedReason: _analysisFailedReason,
    ...rest
  } = trip;

  const summary = trip.canonicalTripSummary;
  const behaviorSummary = parseBehaviorSummaryJson(trip.behaviorSummaryJson);
  const assessability = deriveAnalysisAssessability(trip);
  const analysisFields = buildTripAnalysisApiFields(trip as any);

  return {
    ...rest,
    behaviorEnrichmentStatus,
    drivingScore:
      summary?.scores?.drivingStressScore ?? trip.drivingScore ?? null,
    drivingStressScore: summary?.scores?.drivingStressScore ?? null,
    stressLevel: summary?.scores?.stressLevel ?? null,
    drivingStyleScore: summary?.scores?.drivingStressScore ?? null,
    scoreSource: summary?.scores?.scoreSource ?? 'derived',
    totalAccelerationEvents: summary?.events?.totalAccelerationEvents ?? 0,
    hardAccelerationEvents: summary?.events?.hardAccelerationEvents ?? 0,
    totalBrakingEvents: summary?.events?.totalBrakingEvents ?? 0,
    hardBrakingEvents: summary?.events?.hardBrakingEvents ?? 0,
    fullBrakingEvents: summary?.events?.fullBrakingEvents ?? 0,
    corneringEvents: summary?.events?.corneringEvents ?? 0,
    abuseEvents: summary?.events?.abuseEvents ?? 0,
    speedingEvents: summary?.events?.speedingEvents ?? 0,
    assignmentStatus: summary?.assignment?.assignmentStatus ?? null,
    assignmentSubjectType: summary?.assignment?.assignmentSubjectType ?? null,
    assignmentSubjectId: summary?.assignment?.assignmentSubjectId ?? null,
    assignedBookingId: summary?.assignment?.assignedBookingId ?? null,
    isPrivateTrip: summary?.assignment?.isPrivateTrip ?? false,
    scoreEligible: summary?.assignment?.scoreEligible ?? false,
    behaviorReady: behaviorEnrichmentStatus === 'COMPLETED',
    detailsLimited: isTripDetailsLimited(trip),
    behaviorSummaryAssessability: {
      analysisAssessability: assessability.analysisAssessability,
      analysisLimitReason: assessability.analysisLimitReason,
      shortTermMisuseAssessable: assessability.shortTermMisuseAssessable,
      nativeBehaviorEventsAvailable: assessability.nativeBehaviorEventsAvailable,
      hfInsufficientForAbuse: assessability.hfInsufficientForAbuse,
      nativeEventCount: assessability.nativeEventCount ?? null,
      hfPointsTotal: assessability.hfPointsTotal ?? behaviorSummary.hfPointsTotal ?? null,
      hfPointsCleaned: assessability.hfPointsCleaned ?? behaviorSummary.hfPointsCleaned ?? null,
    },
    ...analysisFields,
  };
}
