import { scoreChargingStationCandidates } from './charging-station-resolve.pipeline';
import { buildRawCandidate } from './testing/charging-station-test-factories';
import { decideChargingStationMatch } from './charging-station-match-decision';

describe('charging-station-resolve.pipeline ground truth', () => {
  const diagnostics = {
    searchRadiusMeters: 120,
    usedFallbackRadius: false,
    rawCandidateCount: 2,
    dedupedCandidateCount: 2,
    queryLatencyMs: 1,
    dedupeMergedCount: 0,
  };

  it('G11 missing name still scores from geometry', () => {
    const scored = scoreChargingStationCandidates([
      buildRawCandidate({ name: null, geometry_distance_m: 5, inside_geometry: true }),
    ]);
    expect(scored[0].score).toBeGreaterThan(100);
  });

  it('G12 metadata-rich worse geometry loses decision', () => {
    const rich = buildRawCandidate({
      osm_id: 2,
      name: 'Full Meta',
      brand: 'X',
      operator: 'Y',
      network: 'Z',
      street: 'S',
      postcode: 'P',
      city: 'C',
      geometry_distance_m: 90,
    });
    const close = buildRawCandidate({
      osm_id: 1,
      name: null,
      brand: null,
      geometry_distance_m: 8,
    });
    const result = decideChargingStationMatch(
      scoreChargingStationCandidates([rich, close]),
      'synthetic-e6-2-test',
      diagnostics,
    );
    expect(result.status).toBe('MATCHED');
    expect(result.station?.osmId).toBe('1');
  });
});
