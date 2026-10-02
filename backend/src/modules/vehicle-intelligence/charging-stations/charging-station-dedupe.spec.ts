import {
  dedupeChargingStationCandidates,
  dedupeChargingStationCandidatesByOsmIdentity,
} from './charging-station-dedupe';
import { buildScoredCandidate } from './testing/charging-station-test-factories';

describe('charging-station-dedupe', () => {
  it('R7 dedupes duplicate OSM identity', () => {
    const a = buildScoredCandidate({ score: 80, station: { osmType: 'node', osmId: '42' } });
    const b = buildScoredCandidate({ score: 90, station: { osmType: 'node', osmId: '42' } });
    const { candidates, mergedCount } = dedupeChargingStationCandidatesByOsmIdentity([a, b]);
    expect(candidates).toHaveLength(1);
    expect(mergedCount).toBe(1);
    expect(candidates[0].score).toBe(90);
  });

  it('does not merge distinct operators by proximity alone', () => {
    const a = buildScoredCandidate({
      station: { osmId: '1', brand: 'A', latitude: 50.001, longitude: 8.001 },
    });
    const b = buildScoredCandidate({
      station: { osmId: '2', brand: 'B', latitude: 50.0011, longitude: 8.0011 },
    });
    expect(dedupeChargingStationCandidates([a, b]).candidates).toHaveLength(2);
  });
});
