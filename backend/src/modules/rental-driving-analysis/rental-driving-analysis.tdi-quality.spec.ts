import {
  isAdmissibleTripDrivingImpactStatus,
  resolveRentalTripStressScore,
} from './rental-driving-analysis.tdi-quality';

describe('rental-driving-analysis TDI quality (P1-2 / P1-3)', () => {
  it.each(['COMPLETE', 'PARTIAL'] as const)('accepts admissible TDI status %s', (status) => {
    expect(isAdmissibleTripDrivingImpactStatus(status)).toBe(true);
  });

  it.each(['STALE', 'PENDING', 'FAILED', 'UNSUPPORTED'] as const)(
    'rejects inadmissible TDI status %s',
    (status) => {
      expect(isAdmissibleTripDrivingImpactStatus(status)).toBe(false);
    },
  );

  it('uses COMPLETE TDI score', () => {
    expect(
      resolveRentalTripStressScore({
        tdiRow: { drivingStressScore: 61, analysisStatus: 'COMPLETE' },
        tripLegacyDrivingScore: 99,
      }),
    ).toEqual({ score: 61, source: 'trip_driving_impact' });
  });

  it('uses PARTIAL TDI score', () => {
    expect(
      resolveRentalTripStressScore({
        tdiRow: { drivingStressScore: 55, analysisStatus: 'PARTIAL' },
        tripLegacyDrivingScore: 20,
      }),
    ).toEqual({ score: 55, source: 'trip_driving_impact' });
  });

  it('rejects STALE TDI and does not legacy-fallback', () => {
    expect(
      resolveRentalTripStressScore({
        tdiRow: { drivingStressScore: 70, analysisStatus: 'STALE' },
        tripLegacyDrivingScore: 40,
      }),
    ).toEqual({ score: null, source: 'none' });
  });

  it('returns null when admissible TDI has null score', () => {
    expect(
      resolveRentalTripStressScore({
        tdiRow: { drivingStressScore: null, analysisStatus: 'COMPLETE' },
        tripLegacyDrivingScore: 40,
      }),
    ).toEqual({ score: null, source: 'trip_driving_impact' });
  });

  it('uses vehicle_trip_compat when no TDI row', () => {
    expect(
      resolveRentalTripStressScore({
        tdiRow: null,
        tripLegacyDrivingScore: 33,
      }),
    ).toEqual({ score: 33, source: 'vehicle_trip_compat' });
  });

  it('returns none when no TDI and no legacy score', () => {
    expect(
      resolveRentalTripStressScore({
        tdiRow: undefined,
        tripLegacyDrivingScore: null,
      }),
    ).toEqual({ score: null, source: 'none' });
  });
});