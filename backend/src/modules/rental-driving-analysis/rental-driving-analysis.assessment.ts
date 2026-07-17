import type {
  BookingStatus,
  RentalDrivingAnalysisAssessmentStatus,
  RentalDrivingAnalysisCompleteness,
} from '@prisma/client';
import type { AnalysisAssessability } from '../vehicle-intelligence/trips/trip-analysis-status';

export type RentalAssessmentMissingComponent =
  | 'BOOKING_NOT_COMPLETED'
  | 'NO_ASSIGNED_TRIPS'
  | 'ASSIGNED_TRIPS_NOT_FINALIZED'
  | 'TRIP_ANALYSIS_PENDING'
  | 'TRIP_ANALYSIS_FAILED'
  | 'ATTRIBUTION_NOT_COMPUTED'
  | 'MISUSE_NOT_RECONCILED'
  | 'DRIVING_IMPACT_PENDING'
  | 'DRIVING_IMPACT_FAILED'
  | 'PENDING_CORE_JOBS'
  | 'INSUFFICIENT_SCORED_TRIPS'
  | 'LOW_DATA_CAPABILITY';

export type RentalAssessmentTripSnapshot = {
  tripId: string;
  tripStatus: string;
  tripAnalysisStatus: string | null;
  drivingImpactStatus: string | null;
  analysisAssessability: AnalysisAssessability;
  analysisRunStatus:
    | 'COMPLETED'
    | 'FAILED'
    | 'PENDING'
    | 'IN_PROGRESS'
    | 'SUPERSEDED'
    | 'MISSING';
  hasAttribution: boolean;
  misuseReconciled: boolean;
  drivingImpactSettled: boolean;
};

export type RentalAssessmentSnapshot = {
  bookingStatus: BookingStatus;
  analysisCompleteness: RentalDrivingAnalysisCompleteness;
  assignedTripCount: number;
  pendingCoreJobCount: number;
  pendingRentalRecomputeJobCount: number;
  trips: RentalAssessmentTripSnapshot[];
};

export type RentalAssessmentSummary = {
  status: RentalDrivingAnalysisAssessmentStatus;
  missingComponents: RentalAssessmentMissingComponent[];
  technicalFailures: string[];
  capabilityGaps: string[];
  allowsStrongCustomerRecommendation: boolean;
  tripBreakdown: {
    assignedTripCount: number;
    finalizedTripCount: number;
    tripsWithCompletedAnalysis: number;
    tripsNotAssessable: number;
    tripsWithFailedAnalysis: number;
    tripsWithAttribution: number;
    tripsWithReconciledMisuse: number;
    tripsWithReadyImpact: number;
    tripsWithImpactUnavailable: number;
    pendingCoreJobCount: number;
    pendingRentalRecomputeJobCount: number;
  };
};

const TERMINAL_ANALYSIS_STATUSES = new Set(['COMPLETED', 'SKIPPED', 'FAILED']);

function isTripAnalysisSettled(trip: RentalAssessmentTripSnapshot): boolean {
  if (trip.analysisRunStatus === 'COMPLETED') return true;
  if (trip.tripAnalysisStatus && TERMINAL_ANALYSIS_STATUSES.has(trip.tripAnalysisStatus)) {
    return true;
  }
  if (
    trip.analysisRunStatus === 'MISSING' &&
    trip.analysisAssessability === 'NOT_ASSESSABLE'
  ) {
    return true;
  }
  return false;
}

function isTripAnalysisFailed(trip: RentalAssessmentTripSnapshot): boolean {
  return trip.analysisRunStatus === 'FAILED' || trip.tripAnalysisStatus === 'FAILED';
}

function isTripAnalysisInProgress(trip: RentalAssessmentTripSnapshot): boolean {
  if (isTripAnalysisFailed(trip) || isTripAnalysisSettled(trip)) return false;
  if (
    trip.analysisRunStatus === 'PENDING' ||
    trip.analysisRunStatus === 'IN_PROGRESS'
  ) {
    return true;
  }
  return (
    trip.tripAnalysisStatus === 'PENDING' ||
    trip.tripAnalysisStatus === 'IN_PROGRESS' ||
    trip.tripAnalysisStatus === 'PARTIAL'
  );
}

export function allowsStrongCustomerRecommendation(
  status: RentalDrivingAnalysisAssessmentStatus,
): boolean {
  return status === 'COMPLETE';
}

/**
 * Deterministic rental analysis completeness assessment (P61).
 * Separates technical failures from low capability and lists missing components.
 */
export function assessRentalDrivingAnalysis(
  snapshot: RentalAssessmentSnapshot,
): RentalAssessmentSummary {
  const missingComponents: RentalAssessmentMissingComponent[] = [];
  const technicalFailures: string[] = [];
  const capabilityGaps: string[] = [];

  const finalizedTrips = snapshot.trips.filter((trip) => trip.tripStatus === 'COMPLETED');
  const notFinalizedCount = snapshot.trips.length - finalizedTrips.length;
  const assessableTrips = finalizedTrips.filter(
    (trip) => trip.analysisAssessability !== 'NOT_ASSESSABLE',
  );

  if (snapshot.bookingStatus !== 'COMPLETED') {
    missingComponents.push('BOOKING_NOT_COMPLETED');
  }
  if (snapshot.assignedTripCount === 0) {
    missingComponents.push('NO_ASSIGNED_TRIPS');
  }
  if (notFinalizedCount > 0) {
    missingComponents.push('ASSIGNED_TRIPS_NOT_FINALIZED');
  }
  if (snapshot.pendingCoreJobCount > 0 || snapshot.pendingRentalRecomputeJobCount > 0) {
    missingComponents.push('PENDING_CORE_JOBS');
  }

  if (snapshot.analysisCompleteness === 'INSUFFICIENT') {
    missingComponents.push('INSUFFICIENT_SCORED_TRIPS');
    capabilityGaps.push('insufficient_scored_trips');
  } else if (snapshot.analysisCompleteness === 'PARTIAL') {
    capabilityGaps.push('partial_trip_coverage');
    missingComponents.push('LOW_DATA_CAPABILITY');
  }

  let tripsWithCompletedAnalysis = 0;
  let tripsNotAssessable = 0;
  let tripsWithFailedAnalysis = 0;
  let tripsWithAttribution = 0;
  let tripsWithReconciledMisuse = 0;
  let tripsWithReadyImpact = 0;
  let tripsWithImpactUnavailable = 0;

  for (const trip of snapshot.trips) {
    if (trip.analysisAssessability === 'NOT_ASSESSABLE') {
      tripsNotAssessable += 1;
    }
    if (trip.hasAttribution) {
      tripsWithAttribution += 1;
    }
    if (trip.misuseReconciled) {
      tripsWithReconciledMisuse += 1;
    }
    if (trip.drivingImpactStatus === 'READY') {
      tripsWithReadyImpact += 1;
    }
    if (trip.drivingImpactStatus === 'SKIPPED') {
      tripsWithImpactUnavailable += 1;
    }

    if (trip.tripStatus !== 'COMPLETED') {
      continue;
    }

    if (isTripAnalysisFailed(trip)) {
      tripsWithFailedAnalysis += 1;
      technicalFailures.push(`trip:${trip.tripId}:analysis_failed`);
      missingComponents.push('TRIP_ANALYSIS_FAILED');
    } else if (isTripAnalysisSettled(trip)) {
      tripsWithCompletedAnalysis += 1;
    }

    if (!isTripAnalysisFailed(trip)) {
      if (isTripAnalysisInProgress(trip)) {
        missingComponents.push('TRIP_ANALYSIS_PENDING');
      } else if (
        !isTripAnalysisSettled(trip) &&
        trip.analysisAssessability !== 'NOT_ASSESSABLE'
      ) {
        missingComponents.push('TRIP_ANALYSIS_PENDING');
      }
    }

    if (trip.drivingImpactStatus === 'FAILED') {
      technicalFailures.push(`trip:${trip.tripId}:driving_impact_failed`);
      missingComponents.push('DRIVING_IMPACT_FAILED');
    } else if (!trip.drivingImpactSettled) {
      missingComponents.push('DRIVING_IMPACT_PENDING');
    }

    if (!trip.hasAttribution && trip.analysisAssessability !== 'NOT_ASSESSABLE') {
      missingComponents.push('ATTRIBUTION_NOT_COMPUTED');
    }

    if (
      !trip.misuseReconciled &&
      trip.analysisAssessability === 'FULL'
    ) {
      missingComponents.push('MISUSE_NOT_RECONCILED');
    }
  }

  if (
    snapshot.bookingStatus === 'COMPLETED' &&
    finalizedTrips.length > 0 &&
    assessableTrips.length === 0
  ) {
    capabilityGaps.push('all_trips_not_assessable');
  }

  const uniqueMissing = [...new Set(missingComponents)];
  const uniqueTechnicalFailures = [...new Set(technicalFailures)];
  const uniqueCapabilityGaps = [...new Set(capabilityGaps)];

  let status: RentalDrivingAnalysisAssessmentStatus;

  if (uniqueTechnicalFailures.length > 0) {
    status = 'FAILED';
  } else if (
    snapshot.bookingStatus !== 'COMPLETED' ||
    notFinalizedCount > 0 ||
    snapshot.pendingCoreJobCount > 0 ||
    snapshot.pendingRentalRecomputeJobCount > 0 ||
    uniqueMissing.includes('TRIP_ANALYSIS_PENDING') ||
    uniqueMissing.includes('DRIVING_IMPACT_PENDING')
  ) {
    status = 'PROVISIONAL';
  } else if (
    snapshot.assignedTripCount === 0 ||
    (finalizedTrips.length > 0 && assessableTrips.length === 0) ||
    snapshot.analysisCompleteness === 'INSUFFICIENT'
  ) {
    status = 'NOT_ASSESSABLE';
  } else if (uniqueMissing.length > 0) {
    status = 'PARTIAL';
  } else {
    status = 'COMPLETE';
  }

  return {
    status,
    missingComponents: uniqueMissing,
    technicalFailures: uniqueTechnicalFailures,
    capabilityGaps: uniqueCapabilityGaps,
    allowsStrongCustomerRecommendation: allowsStrongCustomerRecommendation(status),
    tripBreakdown: {
      assignedTripCount: snapshot.assignedTripCount,
      finalizedTripCount: finalizedTrips.length,
      tripsWithCompletedAnalysis,
      tripsNotAssessable,
      tripsWithFailedAnalysis,
      tripsWithAttribution,
      tripsWithReconciledMisuse,
      tripsWithReadyImpact,
      tripsWithImpactUnavailable,
      pendingCoreJobCount: snapshot.pendingCoreJobCount,
      pendingRentalRecomputeJobCount: snapshot.pendingRentalRecomputeJobCount,
    },
  };
}

export function buildRentalAssessmentTripSnapshot(input: {
  tripId: string;
  tripStatus: string;
  tripAnalysisStatus?: string | null;
  drivingImpactStatus?: string | null;
  analysisAssessability: AnalysisAssessability;
  analysisRunStatus?:
    | 'COMPLETED'
    | 'FAILED'
    | 'PENDING'
    | 'IN_PROGRESS'
    | 'SUPERSEDED'
    | 'MISSING';
  hasAttribution: boolean;
  misuseStage?: 'pending' | 'done' | 'skipped' | 'failed' | null;
}): RentalAssessmentTripSnapshot {
  const drivingImpactStatus = input.drivingImpactStatus ?? null;
  const drivingImpactSettled =
    drivingImpactStatus === 'READY' || drivingImpactStatus === 'SKIPPED';

  const misuseReconciled =
    input.misuseStage === 'done' ||
    input.misuseStage === 'skipped' ||
    input.analysisAssessability === 'NOT_ASSESSABLE';

  return {
    tripId: input.tripId,
    tripStatus: input.tripStatus,
    tripAnalysisStatus: input.tripAnalysisStatus ?? null,
    drivingImpactStatus,
    analysisAssessability: input.analysisAssessability,
    analysisRunStatus: input.analysisRunStatus ?? 'MISSING',
    hasAttribution: input.hasAttribution,
    misuseReconciled,
    drivingImpactSettled,
  };
}
