import { mapTripForVehicleApi } from './trip-api.mapper';

describe('mapTripForVehicleApi driving impact provenance', () => {
  it('maps additive provenance fields from canonical summary', () => {
    const mapped = mapTripForVehicleApi({
      id: 'trip-1',
      canonicalTripSummary: {
        scores: {
          drivingStressScore: 66,
          stressLevel: 'high',
          scoreSource: 'trip_driving_impact',
          drivingImpactAnalysisStatus: 'PARTIAL',
          drivingImpactScoreSource: 'trip_driving_impact',
          drivingImpactSourceCompleteness: 0.55,
        },
        events: {},
        assignment: {},
      },
    } as any);

    expect(mapped.drivingStressScore).toBe(66);
    expect(mapped.drivingImpactAnalysisStatus).toBe('PARTIAL');
    expect(mapped.drivingImpactScoreSource).toBe('trip_driving_impact');
    expect(mapped.drivingImpactSourceCompleteness).toBe(0.55);
  });

  it('remains compatible when older payloads omit new metadata', () => {
    const mapped = mapTripForVehicleApi({
      id: 'trip-legacy',
      drivingScore: 40,
      canonicalTripSummary: {
        scores: {
          drivingStressScore: 40,
          stressLevel: 'moderate',
          scoreSource: 'vehicle_trip_compat',
        },
        events: {},
        assignment: {},
      },
    } as any);

    expect(mapped.drivingStressScore).toBe(40);
    expect(mapped.drivingImpactAnalysisStatus).toBeNull();
    expect(mapped.drivingImpactScoreSource).toBe('vehicle_trip_compat');
    expect(mapped.drivingImpactSourceCompleteness).toBeNull();
  });
});
