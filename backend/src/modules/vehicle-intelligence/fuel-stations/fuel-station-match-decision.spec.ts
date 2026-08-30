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

  it('does not MATCH without defined confidence for score 45-54', () => {
    const lone = buildScoredCandidate({ score: 52, features: { geometryDistanceMeters: 95 } });
    const result = decideFuelStationMatch([lone], 'geofabrik-germany-test', diagnostics);
    expect(result.status).toBe('NOT_FOUND');
  });

  it('MATCHED LOW at score boundary 55', () => {
    const lone = buildScoredCandidate({ score: 55, features: { geometryDistanceMeters: 80 } });
    const result = decideFuelStationMatch([lone], 'geofabrik-germany-test', diagnostics);
    expect(result.status).toBe('MATCHED');
    expect(result.confidence).toBe('LOW');
  });

  it('NOT_FOUND at score boundary 54', () => {
    const lone = buildScoredCandidate({ score: 54, features: { geometryDistanceMeters: 80 } });
    const result = decideFuelStationMatch([lone], 'geofabrik-germany-test', diagnostics);
    expect(result.status).toBe('NOT_FOUND');
  });

  it('MATCHED MEDIUM at score boundary 70', () => {
    const lone = buildScoredCandidate({ score: 70, features: { geometryDistanceMeters: 30 } });
    const result = decideFuelStationMatch([lone], 'geofabrik-germany-test', diagnostics);
    expect(result.status).toBe('MATCHED');
    expect(result.confidence).toBe('MEDIUM');
  });

  it('MATCHED HIGH at score boundary 85 with close geometry', () => {
    const lone = buildScoredCandidate({
      score: 85,
      features: { geometryDistanceMeters: 12, insideGeometry: false },
    });
    const result = decideFuelStationMatch([lone], 'geofabrik-germany-test', diagnostics);
    expect(result.status).toBe('MATCHED');
    expect(result.confidence).toBe('HIGH');
  });

  it('MATCHED MEDIUM not HIGH at score 85 when geometry >15m and not inside', () => {
    const lone = buildScoredCandidate({
      score: 85,
      features: { geometryDistanceMeters: 18, insideGeometry: false },
    });
    const result = decideFuelStationMatch([lone], 'geofabrik-germany-test', diagnostics);
    expect(result.status).toBe('MATCHED');
    expect(result.confidence).toBe('MEDIUM');
  });

  it('AMBIGUOUS at score boundary 45-54 with close second candidate', () => {
    const top = buildScoredCandidate({ score: 58, features: { geometryDistanceMeters: 40 } });
    const second = buildScoredCandidate({ score: 56, station: { osmId: '2' }, features: { geometryDistanceMeters: 42 } });
    const result = decideFuelStationMatch([top, second], 'geofabrik-germany-test', diagnostics);
    expect(result.status).toBe('AMBIGUOUS');
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
