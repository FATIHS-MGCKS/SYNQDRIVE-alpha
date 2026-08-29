import {
  splitFilteredGeometryByGaps,
  splitGeometryAtGapBoundaries,
  splitMatchedGeometryByBoundaries,
  toMultiLineStringGeometry,
} from './trip-route-segment-geometry';

describe('trip-route-segment-geometry', () => {
  const line = [
    [13.4, 52.5],
    [13.41, 52.51],
    [13.42, 52.52],
    [13.43, 52.53],
    [13.44, 52.54],
  ] as [number, number][];

  it('returns a single segment when no gaps exist', () => {
    expect(splitGeometryAtGapBoundaries(line, [])).toEqual([line]);
  });

  it('splits FILTERED geometry at UNKNOWN gaps without bridging', () => {
    const segments = splitFilteredGeometryByGaps(line, [
      {
        afterFilteredPointIndex: 1,
        beforeFilteredPointIndex: 2,
        gapSeconds: 240,
        continuity: 'UNKNOWN',
      },
    ]);
    expect(segments).toEqual([line.slice(0, 2), line.slice(2)]);
    expect(segments[0][segments[0].length - 1]).not.toEqual(segments[1][0]);
  });

  it('splits MATCHED geometry using matched segment boundaries', () => {
    const segments = splitMatchedGeometryByBoundaries(line, [
      {
        segmentIndex: 0,
        afterMatchedPointIndex: 2,
        beforeMatchedPointIndex: 3,
        gapSeconds: 300,
        continuity: 'UNKNOWN',
      },
    ]);
    expect(segments).toEqual([line.slice(0, 3), line.slice(3)]);
  });

  it('wraps segments as MultiLineString with at least one coordinate ring', () => {
    const geometry = toMultiLineStringGeometry([line.slice(0, 2), line.slice(2)]);
    expect(geometry).toEqual({
      type: 'MultiLineString',
      coordinates: [line.slice(0, 2), line.slice(2)],
    });
  });
});
