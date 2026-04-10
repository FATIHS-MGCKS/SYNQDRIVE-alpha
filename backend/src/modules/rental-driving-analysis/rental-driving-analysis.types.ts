/** Structured agent response for Rental Driving Analysis (UI-ready). */
export interface RentalDrivingAnalysisPayload {
  analysisMeta: {
    vehicleId: string;
    driverId: string;
    rentalPeriodId: string;
    periodStart: string;
    periodEnd: string;
    dataConfidence: 'low' | 'medium' | 'high';
  };
  overallAssessment: {
    level: 'good' | 'watch' | 'attention';
    title: string;
    shortSummary: string;
  };
  driverStyle: {
    category: 'safe' | 'balanced' | 'wear_promoting' | 'aggressive' | 'abusive' | 'high_risk';
    label: string;
    summary: string;
  };
  riskAnalysis: {
    level: 'low' | 'medium' | 'high';
    summary: string;
    keyRisks: string[];
  };
  usagePattern: {
    tripType: 'mostly_short_distance' | 'mostly_long_distance' | 'mixed';
    roadDistribution: { cityPercent: number; highwayPercent: number; countryRoadPercent: number };
    temperatureContext: { avgTemperatureC: number | null; climateNote: string };
  };
  drivingBehavior: {
    drivingScore: number | null;
    safetyStyle: string;
    accelerationBehavior: { level: 'calm' | 'moderate' | 'aggressive'; summary: string };
    brakingBehavior: { level: 'calm' | 'moderate' | 'harsh'; summary: string };
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
  positiveSignals: string[];
  watchpoints: string[];
  recommendations: string[];
}
