import {
  LEGACY_SCORE_MIRROR_MAP,
  mirrorVehicleTripDrivingScore,
  readCanonicalDrivingStressFromRentalPayload,
  readCanonicalStressLevelFromRentalPayload,
} from './legacy-score-mirror';

describe('legacy-score-mirror', () => {
  it('documents canonical → legacy mirror mapping', () => {
    expect(LEGACY_SCORE_MIRROR_MAP.drivingScore).toBe('drivingStressScore');
    expect(LEGACY_SCORE_MIRROR_MAP.avgDrivingScore).toBe('avgDrivingStressScore');
  });

  it('mirrorVehicleTripDrivingScore copies canonical stress only', () => {
    expect(mirrorVehicleTripDrivingScore(72)).toEqual({ drivingScore: 72 });
    expect(mirrorVehicleTripDrivingScore(null)).toEqual({ drivingScore: null });
  });

  it('readCanonicalDrivingStressFromRentalPayload ignores legacy DB column semantics', () => {
    expect(
      readCanonicalDrivingStressFromRentalPayload({
        vehicleStressSummary: { drivingStressScore: 41 },
      }),
    ).toBe(41);
    expect(
      readCanonicalDrivingStressFromRentalPayload({
        vehicleStressSummary: { drivingStressScore: null },
      }),
    ).toBeNull();
    expect(readCanonicalDrivingStressFromRentalPayload({})).toBeNull();
  });

  it('readCanonicalStressLevelFromRentalPayload reads payload stressLevel only', () => {
    expect(
      readCanonicalStressLevelFromRentalPayload({
        vehicleStressSummary: { stressLevel: 'high' },
      }),
    ).toBe('high');
    expect(readCanonicalStressLevelFromRentalPayload({})).toBeNull();
  });
});
