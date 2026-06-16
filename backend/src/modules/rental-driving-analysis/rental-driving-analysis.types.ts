import type { StressLevel } from '../vehicle-intelligence/driving-impact/stress-level.util';

/** Structured agent response for Rental Driving Analysis (vehicle stress focus). */
export interface RentalDrivingAnalysisPayload {
  analysisMeta: {
    vehicleId: string;
    driverId: string;
    rentalPeriodId: string;
    periodStart: string;
    periodEnd: string;
    dataConfidence: 'low' | 'medium' | 'high';
    analysisSource?: 'booking_assignment' | 'time_window_fallback' | 'none';
    scoredTripCount?: number;
    totalDistanceKm?: number;
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
  };
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
