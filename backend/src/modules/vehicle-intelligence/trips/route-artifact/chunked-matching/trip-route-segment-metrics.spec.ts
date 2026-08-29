import { MapboxService } from '../../mapbox.service';
import {
  filteredDistanceAcrossSegments,
  matchedDistanceAcrossSegments,
  assertGeometryValidPerSegment,
  geometryDistanceMeters,
} from './trip-route-segment-metrics';
import type { MeasuredRoutePoint } from '../trip-route-preprocessing.types';

function point(i: number, lat: number, lng: number): MeasuredRoutePoint {
  return {
    latitude: lat,
    longitude: lng,
    recordedAt: new Date(Date.UTC(2026, 7, 1, 10, 0, i)).toISOString(),
    sourceIndex: i,
  };
}

describe('trip-route-segment-metrics', () => {
  it('excludes cross-gap distance from filtered distance', () => {
    const segmentA = Array.from({ length: 5 }, (_, i) => point(i, 52.52, 13.4 + i * 0.001));
    const segmentB = Array.from({ length: 5 }, (_, i) => point(i + 5, 52.52, 13.5 + i * 0.001));
    const points = [...segmentA, ...segmentB];
    const gaps = [
      {
        afterFilteredPointIndex: 4,
        beforeFilteredPointIndex: 5,
        gapSeconds: 600,
        continuity: 'UNKNOWN' as const,
      },
    ];

    const segmented = filteredDistanceAcrossSegments(points, gaps);
    let flat = 0;
    for (let idx = 0; idx < points.length - 1; idx++) {
      const a = points[idx];
      const b = points[idx + 1];
      flat += MapboxService.haversineM(a.latitude, a.longitude, b.latitude, b.longitude);
    }

    expect(segmented).toBeLessThan(flat);
    expect(segmented).toBeGreaterThan(0);
  });

  it('validates geometry per segment without cross-gap impossible jump', () => {
    const segmentA: [number, number][] = [
      [13.4, 52.52],
      [13.4005, 52.5205],
    ];
    const segmentB: [number, number][] = [
      [13.9, 52.52],
      [13.9005, 52.5205],
    ];

    const failures = assertGeometryValidPerSegment([segmentA, segmentB]);
    expect(failures.filter((failure) => failure.includes('impossible_matched_jump'))).toHaveLength(0);
  });

  it('sums matched distance per segment only', () => {
    const segmentA: [number, number][] = [
      [13.4, 52.52],
      [13.41, 52.53],
    ];
    const segmentB: [number, number][] = [
      [13.9, 52.52],
      [13.91, 52.53],
    ];

    const distance = matchedDistanceAcrossSegments([segmentA, segmentB]);
    expect(distance).toBeGreaterThan(0);
  });
});
