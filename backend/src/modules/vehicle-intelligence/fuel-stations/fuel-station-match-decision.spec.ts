import { decideFuelStationMatch, isAmbiguousMatch } from './fuel-station-match-decision';
import { buildScoredCandidate } from './testing/fuel-station-test-factories';

describe('fuel-station-match-decision', () => {
  const diagnostics = {
    searchRadiusMeters: 100,
    usedFallbackRadius: false,
    rawCandidateCount: 2,
    dedupedCandidateCount: 2,
    queryLatencyMs: 1,
    dedupeMergedCount: 0,
  };

  it('returns NOT_FOUND when no candidates', () => {
    const result = decideFuelStationMatch([], 'geofabrik-germany-test', diagnostics);
    expect(result.status).toBe('NOT_FOUND');
  });

  it('matches polygon interior with HIGH confidence', () => {
    const top = buildScoredCandidate({
      score: 120,
      geometryType: 'POLYGON',
      features: {
        insideGeometry: true,
        geometryDistanceMeters: 0,
        pointDistanceMeters: 10,
        isAreaGeometry: true,
      },
    });
    const result = decideFuelStationMatch([top], 'geofabrik-germany-test', diagnostics);
    expect(result.status).toBe('MATCHED');
    expect(result.confidence).toBe('HIGH');
  });

  it('flags close 20m/25m pair as ambiguous', () => {
    const top = buildScoredCandidate({ score: 75, station: { osmId: '1', distanceMeters: 20 }, features: { geometryDistanceMeters: 20 } });
    const second = buildScoredCandidate({ score: 72, station: { osmId: '2', distanceMeters: 25 }, features: { geometryDistanceMeters: 25 } });
    expect(isAmbiguousMatch(top, second)).toBe(true);
    const result = decideFuelStationMatch([top, second], 'geofabrik-germany-test', diagnostics);
    expect(result.status).toBe('AMBIGUOUS');
  });

  it('matches 20m vs 120m clearly', () => {
    const top = buildScoredCandidate({ score: 90, features: { geometryDistanceMeters: 15 } });
    const second = buildScoredCandidate({ score: 40, station: { osmId: '2' }, features: { geometryDistanceMeters: 120 } });
    const result = decideFuelStationMatch([top, second], 'geofabrik-germany-test', diagnostics);
    expect(result.status).toBe('MATCHED');
    expect(result.confidence).toBe('HIGH');
  });

  it('does not match weak >100m cluster', () => {
    const top = buildScoredCandidate({ score: 30, features: { geometryDistanceMeters: 110 } });
    const second = buildScoredCandidate({ score: 28, station: { osmId: '2' }, features: { geometryDistanceMeters: 125 } });
    const result = decideFuelStationMatch([top, second], 'geofabrik-germany-test', diagnostics);
    expect(result.status).toBe('NOT_FOUND');
  });

  it('prefers polygon evidence over closer misleading centroid', () => {
    const polygon = buildScoredCandidate({
      score: 130,
      geometryType: 'POLYGON',
      station: { osmId: 'poly', name: 'Shell Area' },
      features: { insideGeometry: true, geometryDistanceMeters: 0, isAreaGeometry: true },
    });
    const point = buildScoredCandidate({
      score: 95,
      station: { osmId: 'point', name: 'Other' },
      features: { geometryDistanceMeters: 15 },
    });
    const result = decideFuelStationMatch([polygon, point], 'geofabrik-germany-test', diagnostics);
    expect(result.status).toBe('MATCHED');
    expect(result.station?.osmId).toBe('poly');
  });

  it('is deterministic for equal scores', () => {
    const a = buildScoredCandidate({ score: 80, station: { osmId: '2' }, geometryType: 'POINT' });
    const b = buildScoredCandidate({ score: 80, station: { osmId: '1' }, geometryType: 'POLYGON', features: { isAreaGeometry: true } });
    const first = decideFuelStationMatch([a, b], 'geofabrik-germany-test', diagnostics);
    const second = decideFuelStationMatch([b, a], 'geofabrik-germany-test', diagnostics);
    expect(first.station?.osmId).toBe(second.station?.osmId);
  });
});
