import { dedupeFuelStationCandidates } from './fuel-station-dedupe';
import { buildScoredCandidate } from './testing/fuel-station-test-factories';

describe('fuel-station-dedupe', () => {
  it('merges duplicate node and polygon for same brand close together', () => {
    const node = buildScoredCandidate({
      station: { osmType: 'node', osmId: '10', brand: 'Aral', name: 'Aral', latitude: 51.3127, longitude: 9.4797 },
      geometryType: 'POINT',
      score: 90,
      features: { insideGeometry: true, geometryDistanceMeters: 2, isAreaGeometry: false },
    });
    const polygon = buildScoredCandidate({
      station: { osmType: 'way', osmId: '20', brand: 'Aral', name: 'Aral', latitude: 51.31275, longitude: 9.47975 },
      geometryType: 'POLYGON',
      score: 120,
      features: { insideGeometry: true, geometryDistanceMeters: 0, isAreaGeometry: true },
    });

    const { candidates, mergedCount } = dedupeFuelStationCandidates([node, polygon]);
    expect(candidates).toHaveLength(1);
    expect(mergedCount).toBe(1);
    expect(candidates[0].station.osmId).toBe('20');
  });

  it('does not merge genuinely adjacent different-brand stations', () => {
    const a = buildScoredCandidate({
      station: { osmId: '1', brand: 'Aral', latitude: 51.31, longitude: 9.48 },
      features: { geometryDistanceMeters: 20 },
    });
    const b = buildScoredCandidate({
      station: { osmId: '2', brand: 'Shell', latitude: 51.3102, longitude: 9.4805 },
      features: { geometryDistanceMeters: 25 },
    });
    const { candidates } = dedupeFuelStationCandidates([a, b]);
    expect(candidates).toHaveLength(2);
  });
});
