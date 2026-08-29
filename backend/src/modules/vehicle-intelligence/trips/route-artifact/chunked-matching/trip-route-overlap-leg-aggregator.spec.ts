import { aggregateSegmentLegsWithoutOverlap } from './trip-route-overlap-leg-aggregator';
import type { MapMatchedChunkResult } from './trip-route-chunked-matching.types';

function chunk(
  chunkIndex: number,
  legs: { distance: number; duration: number; roadClass: string; speedLimit: number | null }[],
  matchedDistanceMeters: number,
): MapMatchedChunkResult {
  return {
    segmentIndex: 0,
    chunkIndex,
    sourceStartIndex: chunkIndex === 0 ? 0 : 80,
    sourceEndIndex: chunkIndex === 0 ? 90 : 170,
    matchedGeometry: [],
    legs: legs.map((leg) => ({ ...leg, geometry: [] })),
    confidence: 0.9,
    matchedDistanceMeters,
    sourceDistanceMeters: matchedDistanceMeters,
    tracepointCoverage: 1,
    status: 'SUCCESS',
    failureReason: null,
    failureClass: null,
  };
}

describe('aggregateSegmentLegsWithoutOverlap', () => {
  it('does not double-count overlapping chunk legs', () => {
    const chunks = [
      chunk(0, [{ distance: 1000, duration: 60, roadClass: 'primary', speedLimit: 50 }], 1000),
      chunk(1, [{ distance: 1000, duration: 60, roadClass: 'primary', speedLimit: 50 }], 1000),
    ];

    const legs = aggregateSegmentLegsWithoutOverlap(chunks, 10);
    const total = legs.reduce((sum, leg) => sum + leg.distance, 0);

    expect(total).toBeLessThan(2000);
    expect(total).toBeGreaterThan(1500);
  });
});
