import { TripRouteArtifactMaterializerService } from './trip-route-artifact-materializer.service';
import { TRIP_ROUTE_ALGORITHM_VERSION } from './trip-route-algorithm-version';
import { VehicleTripRouteArtifactRepository } from './vehicle-trip-route-artifact.repository';
import { TripRouteChunkedMatcherService } from './chunked-matching/trip-route-chunked-matcher.service';

function makeRepository() {
  return {
    upsertRouteArtifact: jest.fn(),
    findByInputFingerprint: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<VehicleTripRouteArtifactRepository>;
}

function makeMatcher() {
  return {
    matchFilteredRoute: jest.fn().mockResolvedValue({
      routeQuality: 'FILTERED',
      matchedGeometry: null,
      matchResult: null,
      matchConfidence: null,
      matchCoverage: null,
      matchedPointCount: null,
      chunkCount: 0,
      failedChunkCount: 0,
      diagnostics: {
        segmentCount: 0,
        chunkCount: 0,
        failedChunkCount: 0,
        retainedPointCount: 0,
        mapboxRequestCount: 0,
        chunkSuccessRatio: 0,
        tracepointCoverage: 0,
        weightedMatchConfidence: 0,
        distanceRatio: 0,
        maxSeamDistanceMeters: 0,
        matchedSegmentBoundaries: [],
        qualityGateFailures: [],
        matchingStatus: 'FILTERED_FALLBACK',
        failureReason: null,
      },
    }),
  } as unknown as jest.Mocked<TripRouteChunkedMatcherService>;
}

const TENANT_POINTS = [
  { latitude: 52.52, longitude: 13.4, recordedAt: '2026-08-01T10:00:00.000Z' },
  { latitude: 52.53, longitude: 13.41, recordedAt: '2026-08-01T10:00:07.000Z' },
];

describe('TripRouteArtifactMaterializerService (R3)', () => {
  let repository: ReturnType<typeof makeRepository>;
  let matcher: ReturnType<typeof makeMatcher>;
  let service: TripRouteArtifactMaterializerService;

  beforeEach(() => {
    repository = makeRepository();
    matcher = makeMatcher();
    service = new TripRouteArtifactMaterializerService(repository, matcher);
  });

  it('Z — artifact upsert idempotency delegates to repository', async () => {
    repository.upsertRouteArtifact.mockResolvedValue({
      action: 'UNCHANGED',
      artifact: { id: 'art-1' } as any,
      previousFingerprint: 'fp',
    });

    const outcome = await service.materializeFromMeasuredRoute({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      points: TENANT_POINTS,
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.action).toBe('UNCHANGED');
    expect(repository.upsertRouteArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        algorithmVersion: TRIP_ROUTE_ALGORITHM_VERSION,
      }),
      expect.objectContaining({ organizationId: 'org-1', tripId: 'trip-1' }),
    );
  });

  it('AJ — MATCHED fingerprint skips paid Mapbox work', async () => {
    repository.findByInputFingerprint.mockResolvedValue({
      routeQuality: 'MATCHED',
      matchedGeometryJson: [
        [13.4, 52.52],
        [13.41, 52.53],
      ],
      diagnosticsJson: {
        r3: {
          persistedMatchResult: {
            legs: [{ distance: 100, duration: 10, roadClass: 'primary', speedLimit: 50, geometry: [] }],
            totalDistance: 100,
            confidence: 0.9,
          },
        },
      },
    } as any);

    const outcome = await service.materializeFromMeasuredRoute({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      points: TENANT_POINTS,
    });

    expect(matcher.matchFilteredRoute).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.routeQuality).toBe('MATCHED');
      expect(outcome.mapboxSkipped).toBe(true);
      expect(outcome.matchResult?.totalDistance).toBe(100);
    }
  });

  it('AK — algorithm version bump changes fingerprint namespace', () => {
    expect(TRIP_ROUTE_ALGORITHM_VERSION).toBe('route-v2-r3');
  });

  it('AS — MATCHED persistence fields populated', async () => {
    matcher.matchFilteredRoute.mockResolvedValue({
      routeQuality: 'MATCHED',
      matchedGeometry: [
        [13.4, 52.52],
        [13.41, 52.53],
      ],
      matchResult: {
        matchedGeometry: [
          [13.4, 52.52],
          [13.41, 52.53],
        ],
        legs: [],
        totalDistance: 120,
        confidence: 0.92,
        tracepointCoverage: 0.98,
      },
      matchConfidence: 0.92,
      matchCoverage: 0.98,
      matchedPointCount: 2,
      chunkCount: 1,
      failedChunkCount: 0,
      diagnostics: {
        segmentCount: 1,
        chunkCount: 1,
        failedChunkCount: 0,
        retainedPointCount: 2,
        mapboxRequestCount: 1,
        chunkSuccessRatio: 1,
        tracepointCoverage: 0.98,
        weightedMatchConfidence: 0.92,
        distanceRatio: 1,
        maxSeamDistanceMeters: 0,
        matchedSegmentBoundaries: [],
        qualityGateFailures: [],
        matchingStatus: 'MATCHED',
        failureReason: null,
      },
    });

    repository.upsertRouteArtifact.mockResolvedValue({
      action: 'CREATED',
      artifact: { id: 'art-1' } as any,
      previousFingerprint: null,
    });

    await service.materializeFromMeasuredRoute({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      points: TENANT_POINTS,
    });

    expect(repository.upsertRouteArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        routeQuality: 'MATCHED',
        matchedGeometry: expect.any(Array),
        matchConfidence: 0.92,
        matchCoverage: 0.98,
        chunkCount: 1,
        failedChunkCount: 0,
        provider: 'mapbox',
      }),
      expect.any(Object),
    );
  });
});
