import {
  buildRentalDrivingAnalysisInputFingerprint,
  requiresNewRentalDrivingAnalysis,
  resolveRentalDrivingAnalysisCompleteness,
} from './rental-driving-analysis.fingerprint';
import { RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION } from './rental-driving-analysis.versioning';

const baseIdentity = {
  organizationId: 'org-1',
  bookingId: 'booking-1',
  vehicleId: 'vehicle-1',
  periodStartIso: '2026-07-01T08:00:00.000Z',
  periodEndIso: '2026-07-05T18:00:00.000Z',
  bookingCustomerId: 'customer-1',
  assignedDriverId: null as string | null,
  actualDriverId: null as string | null,
  attributionType: 'BOOKING_CUSTOMER',
  analysisSource: 'booking_assignment',
  scoredTripCount: 5,
  dtcCountInPeriod: 0,
  hintTripIds: [] as string[],
  trips: [
    {
      tripId: 'trip-a',
      distanceKm: 12,
      drivingStressScore: 34,
      endTimeIso: '2026-07-01T10:00:00.000Z',
    },
    {
      tripId: 'trip-b',
      distanceKm: 20,
      drivingStressScore: 41,
      endTimeIso: '2026-07-02T11:00:00.000Z',
    },
  ],
  calculationVersion: RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION,
};

describe('rental-driving-analysis.fingerprint', () => {
  it('builds a stable 64-char fingerprint for identical inputs', () => {
    const first = buildRentalDrivingAnalysisInputFingerprint(baseIdentity);
    const second = buildRentalDrivingAnalysisInputFingerprint({
      ...baseIdentity,
      trips: [...baseIdentity.trips].reverse(),
    });
    expect(first).toHaveLength(64);
    expect(second).toBe(first);
  });

  it('changes fingerprint when trip stress changes', () => {
    const baseline = buildRentalDrivingAnalysisInputFingerprint(baseIdentity);
    const changed = buildRentalDrivingAnalysisInputFingerprint({
      ...baseIdentity,
      trips: baseIdentity.trips.map((trip) =>
        trip.tripId === 'trip-a' ? { ...trip, drivingStressScore: 90 } : trip,
      ),
    });
    expect(changed).not.toBe(baseline);
  });

  it('requires new analysis when version or fingerprint differs', () => {
    const fingerprint = buildRentalDrivingAnalysisInputFingerprint(baseIdentity);
    expect(
      requiresNewRentalDrivingAnalysis(
        { calculationVersion: RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION, inputFingerprint: fingerprint },
        { calculationVersion: RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION, inputFingerprint: fingerprint },
      ),
    ).toBe(false);

    expect(
      requiresNewRentalDrivingAnalysis(
        { calculationVersion: 'legacy-v0', inputFingerprint: fingerprint },
        { calculationVersion: RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION, inputFingerprint: fingerprint },
      ),
    ).toBe(true);
  });

  it('classifies completeness from source and scored trips', () => {
    expect(
      resolveRentalDrivingAnalysisCompleteness({
        analysisSource: 'none',
        scoredTripCount: 0,
        aggregateConfidence: 'none',
      }),
    ).toBe('INSUFFICIENT');

    expect(
      resolveRentalDrivingAnalysisCompleteness({
        analysisSource: 'booking_assignment',
        scoredTripCount: 2,
        aggregateConfidence: 'medium',
      }),
    ).toBe('PARTIAL');

    expect(
      resolveRentalDrivingAnalysisCompleteness({
        analysisSource: 'booking_assignment',
        scoredTripCount: 5,
        aggregateConfidence: 'high',
      }),
    ).toBe('FULL');
  });
});
