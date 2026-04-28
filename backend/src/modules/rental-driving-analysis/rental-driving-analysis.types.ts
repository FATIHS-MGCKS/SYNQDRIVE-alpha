/** Structured agent response for Rental Driving Analysis (UI-ready). */
export interface RentalDrivingAnalysisPayload {
  analysisMeta: {
    vehicleId: string;
    driverId: string;
    rentalPeriodId: string;
    periodStart: string;
    periodEnd: string;
    dataConfidence: 'low' | 'medium' | 'high';
    /**
     * V4.6.83 — transparency hint for how trips were matched to the booking.
     *   - `booking_assignment` → authoritative match via TripAssignmentService
     *     (VehicleTrip.assignedBookingId = Booking.id). High trust.
     *   - `time_window_fallback` → no trips carry the booking assignment yet,
     *     so we fell back to vehicle + period overlap. Treat as low-confidence.
     *   - `none` → no trips resolved in either path.
     */
    analysisSource?: 'booking_assignment' | 'time_window_fallback' | 'none';
    /**
     * V4.6.95 — booking-level trust metadata produced by the unified
     * `DriverScoreService.aggregateRows` helper. UIs can render an honest
     * "based on N trips, K km" caption and decide whether to dim a card
     * because the data is sparse.
     */
    scoredTripCount?: number;
    safetyScoredTripCount?: number;
    totalDistanceKm?: number;
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
    drivingStyleScore: number | null;
    safetyScore: number | null;
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
