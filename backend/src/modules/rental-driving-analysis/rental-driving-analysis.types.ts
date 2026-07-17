import type { StressLevel } from '../vehicle-intelligence/driving-impact/stress-level.util';
import type { DrivingAttributionType } from '../vehicle-intelligence/trips/driving-attribution-roles/driving-attribution-roles.types';
import type { RentalDrivingNormalizedMetrics } from './rental-driving-analysis.metrics';

export type RentalDrivingAttributionSummary = {
  analysisSource: 'booking_assignment' | 'time_window_fallback' | 'none';
  scoredTripCount: number;
  hintTripCount: number;
  explicitAssignedTripCount: number;
  bookingCustomerId: string | null;
  assignedDriverId: string | null;
  actualDriverId: string | null;
  attributionType: DrivingAttributionType | null;
  customerDecisionEligible: boolean;
};

export type RentalDrivingAnalysisAssessmentStatus =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'PROVISIONAL'
  | 'NOT_ASSESSABLE'
  | 'FAILED';

export type RentalDrivingAssessmentSummary = {
  status: RentalDrivingAnalysisAssessmentStatus;
  missingComponents: string[];
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

/** Structured agent response for Rental Driving Analysis (vehicle stress focus). */
export interface RentalDrivingAnalysisPayload {
  analysisMeta: {
    vehicleId: string;
    bookingCustomerId: string | null;
    assignedDriverId: string | null;
    actualDriverId: string | null;
    attributionType?: DrivingAttributionType;
    customerDecisionEligible?: boolean;
    /** @deprecated Legacy mirror — use bookingCustomerId */
    driverId?: string | null;
    rentalPeriodId: string;
    periodStart: string;
    periodEnd: string;
    dataConfidence: 'low' | 'medium' | 'high';
    analysisSource?: 'booking_assignment' | 'time_window_fallback' | 'none';
    scoredTripCount?: number;
    totalDistanceKm?: number;
    calculationVersion?: string;
    inputFingerprint?: string;
    generatedAt?: string;
    sourceTripsFinalizedAt?: string | null;
    analysisCompleteness?: 'FULL' | 'PARTIAL' | 'INSUFFICIENT';
    stabilityStatus?: 'PROVISIONAL' | 'STABLE';
    assessmentStatus?: RentalDrivingAnalysisAssessmentStatus;
    assessmentSummary?: RentalDrivingAssessmentSummary;
    maturity?: string;
    recomputeReason?: string | null;
    attributionSummary?: RentalDrivingAttributionSummary;
  };
  overallAssessment: {
    level: 'low_stress' | 'moderate_stress' | 'elevated_stress' | 'high_stress';
    title: string;
    shortSummary: string;
  };
  vehicleStressSummary: {
    drivingStressScore: number | null;
    stressLevel: StressLevel | null;
    longitudinalStressScore: number | null;
    brakingStressScore: number | null;
    stopGoStressScore: number | null;
    highSpeedStressScore: number | null;
    thermalBrakeStressScore: number | null;
    summary: string;
  };
  usagePattern: {
    tripType: 'mostly_short_distance' | 'mostly_long_distance' | 'mixed';
    roadDistribution: { cityPercent: number; highwayPercent: number; countryRoadPercent: number };
    temperatureContext: { avgTemperatureC: number | null; climateNote: string };
  };
  eventSummary: {
    drivingEventsCount: number | null;
    abuseDetectionCount: number | null;
    errorCodeOccurred: boolean;
    eventHighlights: string[];
    attributionHints?: Array<{ id: string; attributionReason: string }>;
  };
  rentalMetrics?: RentalDrivingNormalizedMetrics;
  wearImpactAssessment: {
    overallWearImpact: 'low' | 'medium' | 'medium_to_high' | 'high';
    summary: string;
    affectedAreas: Array<{
      area: 'brakes' | 'tires' | 'drivetrain' | 'general_vehicle_stress';
      impact: 'low' | 'medium' | 'high';
      reason: string;
    }>;
  };
  watchpoints: string[];
  recommendations: string[];
}
