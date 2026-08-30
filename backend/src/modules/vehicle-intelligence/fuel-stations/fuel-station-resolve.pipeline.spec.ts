import { scoreFuelStationCandidates } from './fuel-station-resolve.pipeline';
import { buildRawCandidate } from './testing/fuel-station-test-factories';

describe('fuel-station-resolve.pipeline', () => {
  it('scores unnamed brand-only station', () => {
    const scored = scoreFuelStationCandidates([
      buildRawCandidate({ name: null, brand: 'Esso', geometry_distance_m: 22, point_distance_m: 22 }),
    ]);
    expect(scored[0].station.brand).toBe('Esso');
    expect(scored[0].station.name).toBeUndefined();
    expect(scored[0].score).toBeGreaterThan(0);
  });

  it('handles missing address fields', () => {
    const scored = scoreFuelStationCandidates([
      buildRawCandidate({
        street: null,
        housenumber: null,
        postcode: null,
        city: null,
        geometry_distance_m: 50,
        point_distance_m: 50,
      }),
    ]);
    expect(scored[0].features.metadataCompleteness).toBeCloseTo(0.333, 2);
  });
});
