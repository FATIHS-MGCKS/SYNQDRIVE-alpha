/** Shared TripDrivingImpact rows for rental-driving-analysis unit tests (admissible TDI). */
export function mockAdmissibleTripDrivingImpactRow(trip: {
  id: string;
  drivingScore?: number | null;
  distanceKm?: number | null;
}) {
  return {
    tripId: trip.id,
    drivingStressScore: trip.drivingScore ?? null,
    analysisStatus: 'COMPLETE' as const,
    distanceKm: trip.distanceKm ?? 0,
    longitudinalStressScore: null,
    brakingStressScore: null,
    stopGoStressScore: null,
    highSpeedStressScore: null,
    thermalBrakeStressScore: null,
    modelVersion: 'driving-impact-v1',
    sourceSummaryJson: {},
    primarySource: null,
    measuredShare: null,
    providerClassifiedShare: null,
    reconstructedShare: null,
    estimatedProxyShare: 0,
    contextOnlyShare: null,
    nativeEventCount: 0,
    hfEventCount: 0,
    measurementCoverage: null,
    hardwareProfile: null,
    capabilityVersion: null,
    healthEligibility: null,
    provenanceMaturity: null,
    provenanceVersion: null,
  };
}