import { computeCandidateBaseScore, isAreaGeometryType } from './fuel-station-match-scorer';

describe('fuel-station-match-scorer', () => {
  it('detects area geometry types', () => {
    expect(isAreaGeometryType('POLYGON')).toBe(true);
    expect(isAreaGeometryType('MULTIPOLYGON')).toBe(true);
    expect(isAreaGeometryType('POINT')).toBe(false);
  });

  it('scores inside polygon highest', () => {
    const inside = computeCandidateBaseScore({
      insideGeometry: true,
      geometryDistanceMeters: 80,
      pointDistanceMeters: 80,
      isAreaGeometry: true,
      metadataCompleteness: 0.8,
    });
    const nearPoint = computeCandidateBaseScore({
      insideGeometry: false,
      geometryDistanceMeters: 5,
      pointDistanceMeters: 5,
      isAreaGeometry: false,
      metadataCompleteness: 0.8,
    });
    expect(inside).toBeGreaterThanOrEqual(nearPoint);
  });

  it('scores 5m point station strongly', () => {
    const score = computeCandidateBaseScore({
      insideGeometry: false,
      geometryDistanceMeters: 5,
      pointDistanceMeters: 5,
      isAreaGeometry: false,
      metadataCompleteness: 0.5,
    });
    expect(score).toBeGreaterThanOrEqual(120);
  });

  it('scores 100m weakly', () => {
    const score = computeCandidateBaseScore({
      insideGeometry: false,
      geometryDistanceMeters: 100,
      pointDistanceMeters: 100,
      isAreaGeometry: false,
      metadataCompleteness: 0,
    });
    expect(score).toBeLessThanOrEqual(30);
  });
});
