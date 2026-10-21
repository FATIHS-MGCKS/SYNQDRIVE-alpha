import type { MapboxChunkMatchingClient } from './mapbox-chunk-matching.client';
import { planRouteChunks, estimateMapboxRequestCount } from './trip-route-chunk-planner';
import {
  TRIP_ROUTE_CHUNK_MAX_COORDINATES,
  TRIP_ROUTE_CHUNK_OVERLAP_COORDINATES,
  TRIP_ROUTE_MAX_MAPBOX_REQUESTS_PER_TRIP,
} from './trip-route-chunked-matching.constants';
import { runChunkedMatchPipeline } from './trip-route-chunked-matcher';
import { splitFilteredPointsByGaps } from './trip-route-gap-segments';
import {
  retainTrajectoryPoints,
  estimateRetainedPointCount,
} from './trip-route-trajectory-retention';
import { stitchChunkGeometries } from './trip-route-chunk-stitcher';
import { filteredDistanceAcrossSegments } from './trip-route-segment-metrics';
import type { MeasuredRoutePoint } from '../trip-route-preprocessing.types';
import type { MapMatchedChunkResult } from './trip-route-chunked-matching.types';
import { TripRouteMatchRetryableError } from './trip-route-chunked-matching.errors';
import { MapboxService } from '../../mapbox.service';

function point(
  i: number,
  lat = 52.52,
  lng = 13.4,
  seconds = 0,
): MeasuredRoutePoint {
  return {
    latitude: lat + i * 0.00001,
    longitude: lng + i * 0.00001,
    recordedAt: new Date(Date.UTC(2026, 7, 1, 10, 0, seconds)).toISOString(),
    sourceIndex: i,
  };
}

function straightLine(count: number, secondsStep = 7): MeasuredRoutePoint[] {
  return Array.from({ length: count }, (_, i) => point(i, 52.52, 13.4, i * secondsStep));
}

function longStraightDense(count: number): MeasuredRoutePoint[] {
  return Array.from({ length: count }, (_, i) => ({
    latitude: 52.52 + i * 0.0001,
    longitude: 13.4 + i * 0.0001,
    recordedAt: new Date(Date.UTC(2026, 7, 1, 10, 0, i * 7)).toISOString(),
    sourceIndex: i,
  }));
}

function geometryDistance(coords: { longitude: number; latitude: number }[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += MapboxService.haversineM(
      coords[i - 1].latitude,
      coords[i - 1].longitude,
      coords[i].latitude,
      coords[i].longitude,
    );
  }
  return total;
}

function mockClient(
  impl?: (coords: { longitude: number; latitude: number }[]) => any,
): MapboxChunkMatchingClient {
  return {
    matchChunk: jest.fn(async (coords) => {
      if (impl) return impl(coords);
      const geometry = coords.map((c) => [c.longitude, c.latitude] as [number, number]);
      const distance = geometryDistance(coords);
      return {
        ok: true,
        matchedGeometry: geometry,
        legs: [{ distance, duration: 10, roadClass: 'primary', speedLimit: 50, geometry: [] }],
        confidence: 0.95,
        matchedDistanceMeters: distance,
        tracepointCoverage: 1,
      };
    }),
  };
}

function twoSegmentRouteWithGap(gapMeters: number) {
  const segmentA = Array.from({ length: 8 }, (_, i) => point(i, 52.52, 13.4 + i * 0.001, i * 7));
  const segmentB = Array.from({ length: 8 }, (_, i) =>
    point(
      i + 8,
      52.52,
      13.4 + gapMeters / 111_000 + i * 0.001,
      600 + i * 7,
    ),
  );
  const filteredPoints = [...segmentA, ...segmentB];
  const gaps = [
    {
      afterFilteredPointIndex: 7,
      beforeFilteredPointIndex: 8,
      gapSeconds: 600,
      continuity: 'UNKNOWN' as const,
    },
  ];
  return { filteredPoints, gaps };
}

describe('trip-route chunk planner', () => {
  it('A — 2-point route is one chunk', () => {
    expect(planRouteChunks(2, 0)).toEqual([
      expect.objectContaining({ sourceStartIndex: 0, sourceEndIndex: 2 }),
    ]);
  });

  it('C/D — 90 points one chunk, 100 points two chunks', () => {
    expect(planRouteChunks(90, 0)).toHaveLength(1);
    expect(planRouteChunks(100, 0)).toHaveLength(2);
  });

  it('E-H — chunk counts for retained straight routes', () => {
    const retained500 = estimateRetainedPointCount(500);
    const retained1000 = estimateRetainedPointCount(1000);
    expect(estimateMapboxRequestCount(retained500)).toBeLessThan(7);
    expect(estimateMapboxRequestCount(retained1000)).toBeLessThan(13);
    expect(estimateMapboxRequestCount(250)).toBe(3);
  });

  it('deterministic chunk boundaries', () => {
    const a = planRouteChunks(250, 0);
    const b = planRouteChunks(250, 0);
    expect(a).toEqual(b);
    expect(a[1].sourceStartIndex).toBe(
      TRIP_ROUTE_CHUNK_MAX_COORDINATES - TRIP_ROUTE_CHUNK_OVERLAP_COORDINATES,
    );
  });
});

describe('trajectory retention', () => {
  it('M — long straight heavily reduced', () => {
    const retained = retainTrajectoryPoints(straightLine(500));
    expect(retained.length).toBeLessThan(250);
    expect(retained.length).toBeGreaterThan(2);
  });

  it('J — sharp urban turns retained', () => {
    const points = straightLine(20);
    points[10] = { ...points[10], latitude: points[10].latitude + 0.01 };
    points[11] = { ...points[11], longitude: points[11].longitude + 0.01 };
    const retained = retainTrajectoryPoints(points);
    expect(retained.some((p) => p.sourceIndex === 10)).toBe(true);
  });
});

describe('gap segmentation', () => {
  it('N/O — hard gap creates independent segments', () => {
    const points = straightLine(10);
    const gaps = [
      {
        afterFilteredPointIndex: 4,
        beforeFilteredPointIndex: 5,
        gapSeconds: 600,
        continuity: 'UNKNOWN' as const,
      },
    ];
    const segments = splitFilteredPointsByGaps(points, gaps);
    expect(segments).toHaveLength(2);
    expect(segments[0].points).toHaveLength(5);
    expect(segments[1].points).toHaveLength(5);
  });
});

describe('stitching', () => {
  function successChunk(
    idx: number,
    geometry: [number, number][],
  ): MapMatchedChunkResult {
    return {
      segmentIndex: 0,
      chunkIndex: idx,
      sourceStartIndex: 0,
      sourceEndIndex: geometry.length,
      matchedGeometry: geometry,
      legs: [],
      confidence: 0.9,
      matchedDistanceMeters: 100,
      sourceDistanceMeters: 100,
      tracepointCoverage: 1,
      status: 'SUCCESS',
      failureReason: null,
      failureClass: null,
    };
  }

  it('R — duplicate seam geometry removed', () => {
    const a: [number, number][] = [
      [13.4, 52.52],
      [13.41, 52.53],
      [13.42, 52.54],
    ];
    const b: [number, number][] = [
      [13.42, 52.54],
      [13.43, 52.55],
    ];
    const result = stitchChunkGeometries([successChunk(0, a), successChunk(1, b)]);
    expect(result.geometry.length).toBeLessThanOrEqual(4);
  });

  it('T — seam divergence over threshold fails', () => {
    const a: [number, number][] = [[13.4, 52.52], [13.41, 52.53]];
    const b: [number, number][] = [[13.5, 52.6], [13.51, 52.61]];
    const result = stitchChunkGeometries([successChunk(0, a), successChunk(1, b)]);
    expect(result.seamFailures.length).toBeGreaterThan(0);
  });
});

describe('runChunkedMatchPipeline', () => {
  it('B — 50-point route matches', async () => {
    const result = await runChunkedMatchPipeline(
      {
        filteredPoints: straightLine(50),
        filteredGeometry: straightLine(50).map((p) => [p.longitude, p.latitude]),
        gaps: [],
        preprocessingQuality: 'FILTERED',
      },
      mockClient(),
    );
    expect(result.routeQuality).toBe('MATCHED');
    expect(result.matchedGeometry!.length).toBeGreaterThan(1);
  });

  it('two matched segments separated by >500m UNKNOWN gap can pass MATCHED', async () => {
    const { filteredPoints, gaps } = twoSegmentRouteWithGap(2000);
    const result = await runChunkedMatchPipeline(
      {
        filteredPoints,
        filteredGeometry: null,
        gaps,
        preprocessingQuality: 'FILTERED',
      },
      mockClient(),
    );

    expect(result.routeQuality).toBe('MATCHED');
    expect(result.diagnostics.qualityGateFailures).not.toContain('impossible_matched_jump');
    expect(result.diagnostics.qualityGateFailures).not.toContain(
      expect.stringMatching(/impossible_matched_jump_segment/),
    );
  });

  it('5 km UNKNOWN gap excluded from matched/filtered distance ratio', async () => {
    const { filteredPoints, gaps } = twoSegmentRouteWithGap(5000);
    const segmentedFiltered = filteredDistanceAcrossSegments(filteredPoints, gaps);

    const result = await runChunkedMatchPipeline(
      {
        filteredPoints,
        filteredGeometry: null,
        gaps,
        preprocessingQuality: 'FILTERED',
      },
      mockClient(),
    );

    expect(result.routeQuality).toBe('MATCHED');
    expect(result.diagnostics.distanceRatio).toBeGreaterThan(0.7);
    expect(result.diagnostics.distanceRatio).toBeLessThan(1.5);
    expect(segmentedFiltered).toBeGreaterThan(0);
    expect(result.matchResult?.totalDistance).toBeLessThanOrEqual(segmentedFiltered * 1.5);
  });

  it('P — one chunk success', async () => {
    const client = mockClient();
    const result = await runChunkedMatchPipeline(
      {
        filteredPoints: straightLine(30),
        filteredGeometry: null,
        gaps: [],
        preprocessingQuality: 'FILTERED',
      },
      client,
    );
    expect(client.matchChunk).toHaveBeenCalledTimes(1);
    expect(result.routeQuality).toBe('MATCHED');
  });

  it('Q — multiple overlapping chunks after retention', async () => {
    const dense = longStraightDense(2500);
    const retained = retainTrajectoryPoints(dense);
    const expectedChunks = planRouteChunks(retained.length, 0).length;
    const client = mockClient();
    const result = await runChunkedMatchPipeline(
      {
        filteredPoints: dense,
        filteredGeometry: null,
        gaps: [],
        preprocessingQuality: 'FILTERED',
      },
      client,
    );
    expect(expectedChunks).toBeGreaterThan(1);
    expect(client.matchChunk).toHaveBeenCalledTimes(expectedChunks);
    expect(result.routeQuality).toBe('MATCHED');
  });

  it('request cap counts actual provider calls including retries', async () => {
    let calls = 0;
    const client = {
      matchChunk: jest.fn(async () => {
        calls += 1;
        return {
          ok: false,
          failureReason: 'mapbox_request_timeout',
          failureClass: 'RETRYABLE',
        };
      }),
    } as unknown as MapboxChunkMatchingClient;

    await expect(
      runChunkedMatchPipeline(
        {
          filteredPoints: straightLine(10),
          filteredGeometry: null,
          gaps: [],
          preprocessingQuality: 'FILTERED',
        },
        client,
        { maxMapboxRequests: 5 },
      ),
    ).rejects.toBeInstanceOf(TripRouteMatchRetryableError);

    expect(calls).toBeLessThanOrEqual(5);
  });

  it('diagnostics report actual request attempts and retries', async () => {
    let calls = 0;
    const client = {
      matchChunk: jest.fn(async () => {
        calls += 1;
        if (calls < 3) {
          return {
            ok: false as const,
            failureReason: 'mapbox_http_503',
            failureClass: 'RETRYABLE' as const,
          };
        }
        return {
          ok: true as const,
          matchedGeometry: [[13.4, 52.52], [13.41, 52.53]],
          legs: [{ distance: 100, duration: 10, roadClass: 'primary', speedLimit: 50, geometry: [] }],
          confidence: 0.95,
          matchedDistanceMeters: 100,
          tracepointCoverage: 1,
        };
      }),
    } as unknown as MapboxChunkMatchingClient;

    const result = await runChunkedMatchPipeline(
      {
        filteredPoints: straightLine(10),
        filteredGeometry: null,
        gaps: [],
        preprocessingQuality: 'FILTERED',
      },
      client,
    );

    expect(result.diagnostics.mapboxRequestAttemptCount).toBe(3);
    expect(result.diagnostics.retryCount).toBe(2);
    expect(calls).toBe(3);
  });

  it('U — failed middle chunk falls back to FILTERED', async () => {
    let call = 0;
    const client = mockClient(() => {
      call += 1;
      if (call === 2) {
        return { ok: false, failureReason: 'zero_matchings', failureClass: 'NON_RETRYABLE' };
      }
      return {
        ok: true,
        matchedGeometry: [[13.4, 52.52], [13.41, 52.53]],
        legs: [{ distance: 100, duration: 10, roadClass: 'primary', speedLimit: 50, geometry: [] }],
        confidence: 0.9,
        matchedDistanceMeters: 100,
        tracepointCoverage: 1,
      };
    });

    const result = await runChunkedMatchPipeline(
      {
        filteredPoints: straightLine(250, 7),
        filteredGeometry: null,
        gaps: [],
        preprocessingQuality: 'FILTERED',
      },
      client,
    );
    expect(result.routeQuality).toBe('FILTERED');
    expect(result.matchedGeometry).toBeNull();
  });

  it('AF — timeout retryable propagates', async () => {
    const client = {
      matchChunk: jest.fn().mockResolvedValue({
        ok: false,
        failureReason: 'mapbox_request_timeout',
        failureClass: 'RETRYABLE',
      }),
    } as unknown as MapboxChunkMatchingClient;

    await expect(
      runChunkedMatchPipeline(
        {
          filteredPoints: straightLine(10),
          filteredGeometry: null,
          gaps: [],
          preprocessingQuality: 'FILTERED',
        },
        client,
        { maxMapboxRequests: TRIP_ROUTE_MAX_MAPBOX_REQUESTS_PER_TRIP },
      ),
    ).rejects.toBeInstanceOf(TripRouteMatchRetryableError);
  });

  it('AB — low coverage rejects MATCHED', async () => {
    const client = mockClient(() => ({
      ok: true,
      matchedGeometry: [[13.4, 52.52], [13.41, 52.53]],
      legs: [],
      confidence: 0.9,
      matchedDistanceMeters: 100,
      tracepointCoverage: 0.1,
    }));

    const result = await runChunkedMatchPipeline(
      {
        filteredPoints: straightLine(20),
        filteredGeometry: null,
        gaps: [],
        preprocessingQuality: 'FILTERED',
      },
      client,
    );
    expect(result.routeQuality).toBe('FILTERED');
  });

  it('AM/AN — no partial MATCHED artifact', async () => {
    let call = 0;
    const client = mockClient(() => {
      call += 1;
      if (call === 1) {
        return {
          ok: true,
          matchedGeometry: [[13.4, 52.52], [13.41, 52.53]],
          legs: [{ distance: 100, duration: 10, roadClass: 'primary', speedLimit: 50, geometry: [] }],
          confidence: 0.95,
          matchedDistanceMeters: 100,
          tracepointCoverage: 1,
        };
      }
      return { ok: false, failureReason: 'zero_matchings', failureClass: 'NON_RETRYABLE' };
    });

    const result = await runChunkedMatchPipeline(
      {
        filteredPoints: straightLine(250, 7),
        filteredGeometry: null,
        gaps: [],
        preprocessingQuality: 'FILTERED',
      },
      client,
    );
    expect(result.routeQuality).toBe('FILTERED');
    expect(result.matchedGeometry).toBeNull();
  });

  it('AO — retained coordinates are measured only', async () => {
    const client = mockClient((coords) => {
      for (const c of coords) {
        expect(Number.isFinite(c.latitude)).toBe(true);
        expect(Number.isFinite(c.longitude)).toBe(true);
      }
      const geometry = coords.map((c) => [c.longitude, c.latitude]);
      const distance = geometryDistance(coords);
      return {
        ok: true,
        matchedGeometry: geometry,
        legs: [{ distance, duration: 10, roadClass: 'primary', speedLimit: 50, geometry: [] }],
        confidence: 0.9,
        matchedDistanceMeters: distance,
        tracepointCoverage: 1,
      };
    });

    await runChunkedMatchPipeline(
      {
        filteredPoints: straightLine(120, 7),
        filteredGeometry: null,
        gaps: [],
        preprocessingQuality: 'FILTERED',
      },
      client,
    );
  });
});
