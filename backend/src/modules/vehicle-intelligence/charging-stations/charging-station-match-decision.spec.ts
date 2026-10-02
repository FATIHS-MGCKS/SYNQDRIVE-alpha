import { decideChargingStationMatch, isAmbiguousMatch } from './charging-station-match-decision';
import { buildScoredCandidate } from './testing/charging-station-test-factories';

describe('charging-station-match-decision', () => {
  const diagnostics = {
    searchRadiusMeters: 120,
    usedFallbackRadius: false,
    rawCandidateCount: 2,
    dedupedCandidateCount: 2,
    queryLatencyMs: 1,
    dedupeMergedCount: 0,
  };

  it('R8 NOT_FOUND when no candidates', () => {
    const result = decideChargingStationMatch([], 'synthetic-e6-2-test', diagnostics);
    expect(result.status).toBe('NOT_FOUND');
  });

  it('R2 inside polygon HIGH', () => {
    const top = buildScoredCandidate({
      score: 120,
      geometryType: 'POLYGON',
      features: { insideGeometry: true, geometryDistanceMeters: 0, isAreaGeometry: true },
    });
    const result = decideChargingStationMatch([top], 'synthetic-e6-2-test', diagnostics);
    expect(result.status).toBe('MATCHED');
    expect(result.confidence).toBe('HIGH');
  });

  it('R5 near-equal ambiguous', () => {
    const top = buildScoredCandidate({ score: 75, station: { osmId: '1' }, features: { geometryDistanceMeters: 20 } });
    const second = buildScoredCandidate({
      score: 72,
      station: { osmId: '2' },
      features: { geometryDistanceMeters: 25 },
    });
    expect(isAmbiguousMatch(top, second)).toBe(true);
    expect(decideChargingStationMatch([top, second], 'synthetic-e6-2-test', diagnostics).status).toBe(
      'AMBIGUOUS',
    );
  });

  it('R6 overlapping geometries ambiguous', () => {
    const top = buildScoredCandidate({
      score: 110,
      station: { osmId: '1' },
      features: { insideGeometry: true, geometryDistanceMeters: 0 },
    });
    const second = buildScoredCandidate({
      score: 108,
      station: { osmId: '2' },
      dedupeGroupId: 'group-2',
      features: { insideGeometry: true, geometryDistanceMeters: 0 },
    });
    expect(decideChargingStationMatch([top, second], 'synthetic-e6-2-test', diagnostics).status).toBe(
      'AMBIGUOUS',
    );
  });

  it('R4 max distance NOT_FOUND', () => {
    const top = buildScoredCandidate({ score: 90, features: { geometryDistanceMeters: 150 } });
    const result = decideChargingStationMatch([top], 'synthetic-e6-2-test', diagnostics);
    expect(result.status).toBe('NOT_FOUND');
  });

  it('R13 metadata-rich farther cannot beat spatial leader', () => {
    const spatial = buildScoredCandidate({
      score: 95,
      station: { osmId: 'near', name: undefined, brand: undefined },
      features: { geometryDistanceMeters: 12 },
    });
    const metaRich = buildScoredCandidate({
      score: 60,
      station: { osmId: 'far', name: 'Rich', brand: 'Net', operator: 'Op' },
      features: { geometryDistanceMeters: 80, metadataCompleteness: 1 },
    });
    const result = decideChargingStationMatch([spatial, metaRich], 'synthetic-e6-2-test', diagnostics);
    expect(result.status).toBe('MATCHED');
    expect(result.station?.osmId).toBe('near');
  });
});
