import { TripRouteCanonicalReadService } from './trip-route-canonical-read.service';
import { VehicleTripRouteArtifactRepository } from './vehicle-trip-route-artifact.repository';

function line(n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => [13.4 + i * 0.001, 52.5 + i * 0.001]);
}

describe('TripRouteCanonicalReadService', () => {
  const prisma = {
    vehicleTripWaypoint: {
      findMany: jest.fn(),
    },
    drivingIntelligenceJob: {
      findFirst: jest.fn(),
    },
    drivingAnalysisRun: {
      findFirst: jest.fn(),
    },
    drivingAnalysisStage: {
      findFirst: jest.fn(),
    },
  } as any;

  const artifactRepository = {
    getRouteArtifact: jest.fn(),
  } as unknown as jest.Mocked<VehicleTripRouteArtifactRepository>;

  let service: TripRouteCanonicalReadService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.drivingIntelligenceJob.findFirst.mockResolvedValue(null);
    prisma.drivingAnalysisRun.findFirst.mockResolvedValue(null);
    prisma.drivingAnalysisStage.findFirst.mockResolvedValue(null);
    service = new TripRouteCanonicalReadService(prisma, artifactRepository);
  });

  it('returns MATCHED segments from artifact', async () => {
    const matched = line(6);
    artifactRepository.getRouteArtifact.mockResolvedValue({
      tripId: 'trip-1',
      routeQuality: 'MATCHED',
      matchedGeometryJson: matched,
      filteredGeometryJson: matched,
      provider: 'mapbox',
      algorithmVersion: 'route-v2-r3',
      matchConfidence: 0.91,
      matchCoverage: 0.88,
      sourcePointCount: 120,
      filteredPointCount: 80,
      matchedPointCount: 240,
      processedAt: new Date('2026-08-29T12:00:00.000Z'),
      failureReason: null,
      diagnosticsJson: {
        gaps: [],
        r3: {
          matchedSegmentBoundaries: [],
        },
      },
    } as any);
    prisma.vehicleTripWaypoint.findMany.mockResolvedValue(
      matched.map((coord, index) => ({
        latitude: coord[1],
        longitude: coord[0],
        speedKmh: 50,
        recordedAt: new Date(`2026-08-29T10:00:0${index}.000Z`),
      })),
    );

    const response = await service.getCanonicalRouteForTrip('org-1', 'veh-1', 'trip-1');

    expect(response.routeQuality).toBe('MATCHED');
    expect(response.status.processingState).toBe('READY');
    expect(response.geometry?.type).toBe('MultiLineString');
    expect(response.geometry?.coordinates).toHaveLength(1);
    expect(response.speedPoints).toHaveLength(6);
  });

  it('returns two MATCHED segments separated by UNKNOWN gap', async () => {
    const matched = line(8);
    artifactRepository.getRouteArtifact.mockResolvedValue({
      tripId: 'trip-1',
      routeQuality: 'MATCHED',
      matchedGeometryJson: matched,
      filteredGeometryJson: matched,
      provider: 'mapbox',
      algorithmVersion: 'route-v2-r3',
      matchConfidence: 0.9,
      matchCoverage: 0.86,
      sourcePointCount: 120,
      filteredPointCount: 80,
      matchedPointCount: 240,
      processedAt: new Date('2026-08-29T12:00:00.000Z'),
      failureReason: null,
      diagnosticsJson: {
        gaps: [
          {
            afterFilteredPointIndex: 3,
            beforeFilteredPointIndex: 4,
            gapSeconds: 240,
            continuity: 'UNKNOWN',
          },
        ],
        r3: {
          matchedSegmentBoundaries: [
            {
              segmentIndex: 0,
              afterMatchedPointIndex: 3,
              beforeMatchedPointIndex: 4,
              gapSeconds: 240,
              continuity: 'UNKNOWN',
            },
          ],
        },
      },
    } as any);
    prisma.vehicleTripWaypoint.findMany.mockResolvedValue([]);

    const response = await service.getCanonicalRouteForTrip('org-1', 'veh-1', 'trip-1');

    expect(response.geometry?.coordinates).toHaveLength(2);
    expect(response.continuity.status).toBe('GAPS_PRESENT');
    expect(response.continuity.gapCount).toBe(1);
  });

  it('returns FILTERED segments from artifact', async () => {
    const filtered = line(5);
    artifactRepository.getRouteArtifact.mockResolvedValue({
      tripId: 'trip-1',
      routeQuality: 'FILTERED',
      matchedGeometryJson: null,
      filteredGeometryJson: filtered,
      provider: 'dimo-route-enrichment',
      algorithmVersion: 'route-v2-r2',
      matchConfidence: null,
      matchCoverage: null,
      sourcePointCount: 50,
      filteredPointCount: 5,
      matchedPointCount: null,
      processedAt: new Date('2026-08-29T12:00:00.000Z'),
      failureReason: null,
      diagnosticsJson: { gaps: [] },
    } as any);
    prisma.vehicleTripWaypoint.findMany.mockResolvedValue([]);

    const response = await service.getCanonicalRouteForTrip('org-1', 'veh-1', 'trip-1');

    expect(response.routeQuality).toBe('FILTERED');
    expect(response.geometry?.coordinates).toHaveLength(1);
  });

  it('reconstructs RAW geometry from waypoints when artifact quality is RAW', async () => {
    artifactRepository.getRouteArtifact.mockResolvedValue({
      tripId: 'trip-1',
      routeQuality: 'RAW',
      matchedGeometryJson: null,
      filteredGeometryJson: null,
      provider: 'dimo-route-enrichment',
      algorithmVersion: 'route-v2-r2',
      matchConfidence: null,
      matchCoverage: null,
      sourcePointCount: 4,
      filteredPointCount: 0,
      matchedPointCount: null,
      processedAt: new Date('2026-08-29T12:00:00.000Z'),
      failureReason: null,
      diagnosticsJson: { gaps: [] },
    } as any);
    prisma.vehicleTripWaypoint.findMany.mockResolvedValue(
      line(4).map((coord, index) => ({
        latitude: coord[1],
        longitude: coord[0],
        speedKmh: 40,
        recordedAt: new Date(`2026-08-29T10:00:0${index}.000Z`),
      })),
    );

    const response = await service.getCanonicalRouteForTrip('org-1', 'veh-1', 'trip-1');

    expect(response.routeQuality).toBe('RAW');
    expect(response.geometry?.coordinates).toHaveLength(1);
    expect(response.speedPoints).toHaveLength(4);
  });

  it('returns PROCESSING without geometry when artifact is missing and job is active', async () => {
    artifactRepository.getRouteArtifact.mockResolvedValue(null);
    prisma.drivingIntelligenceJob.findFirst.mockResolvedValue({
      status: 'IN_PROGRESS',
      attemptCount: 0,
      maxAttempts: 3,
    });
    prisma.vehicleTripWaypoint.findMany.mockResolvedValue([]);

    const response = await service.getCanonicalRouteForTrip('org-1', 'veh-1', 'trip-1');

    expect(response.status.processingState).toBe('PROCESSING');
    expect(response.routeQuality).toBeNull();
    expect(response.geometry).toBeNull();
  });

  it('falls back to FILTERED when MATCHED geometry is invalid', async () => {
    const filtered = line(4);
    artifactRepository.getRouteArtifact.mockResolvedValue({
      tripId: 'trip-1',
      routeQuality: 'MATCHED',
      matchedGeometryJson: [[13.4, 52.5]],
      filteredGeometryJson: filtered,
      provider: 'mapbox',
      algorithmVersion: 'route-v2-r3',
      matchConfidence: 0.9,
      matchCoverage: 0.86,
      sourcePointCount: 50,
      filteredPointCount: 4,
      matchedPointCount: 10,
      processedAt: new Date('2026-08-29T12:00:00.000Z'),
      failureReason: null,
      diagnosticsJson: { gaps: [] },
    } as any);
    prisma.vehicleTripWaypoint.findMany.mockResolvedValue([]);

    const response = await service.getCanonicalRouteForTrip('org-1', 'veh-1', 'trip-1');

    expect(response.routeQuality).toBe('FILTERED');
    expect(response.geometry?.coordinates).toHaveLength(1);
    expect(response.quality.matchConfidence).toBeNull();
    expect(response.points).toBeUndefined();
  });

  it('falls back to RAW when MATCHED and FILTERED geometry are invalid', async () => {
    artifactRepository.getRouteArtifact.mockResolvedValue({
      tripId: 'trip-1',
      routeQuality: 'MATCHED',
      matchedGeometryJson: 'not-json',
      filteredGeometryJson: [[13.4, 52.5]],
      provider: 'mapbox',
      algorithmVersion: 'route-v2-r3',
      matchConfidence: 0.9,
      matchCoverage: 0.86,
      sourcePointCount: 4,
      filteredPointCount: 1,
      matchedPointCount: 1,
      processedAt: new Date('2026-08-29T12:00:00.000Z'),
      failureReason: null,
      diagnosticsJson: { gaps: [] },
    } as any);
    prisma.vehicleTripWaypoint.findMany.mockResolvedValue(
      line(4).map((coord, index) => ({
        latitude: coord[1],
        longitude: coord[0],
        speedKmh: 40,
        recordedAt: new Date(`2026-08-29T10:00:0${index}.000Z`),
      })),
    );

    const response = await service.getCanonicalRouteForTrip('org-1', 'veh-1', 'trip-1');

    expect(response.routeQuality).toBe('RAW');
    expect(response.geometry?.coordinates).toHaveLength(1);
  });

  it('uses persisted gap count for RAW continuity without filtered indices on waypoints', async () => {
    artifactRepository.getRouteArtifact.mockResolvedValue({
      tripId: 'trip-1',
      routeQuality: 'RAW',
      matchedGeometryJson: null,
      filteredGeometryJson: null,
      provider: 'dimo-route-enrichment',
      algorithmVersion: 'route-v2-r2',
      matchConfidence: null,
      matchCoverage: null,
      sourcePointCount: 4,
      filteredPointCount: 0,
      matchedPointCount: null,
      processedAt: new Date('2026-08-29T12:00:00.000Z'),
      failureReason: null,
      diagnosticsJson: {
        gaps: [
          {
            afterFilteredPointIndex: 1,
            beforeFilteredPointIndex: 2,
            gapSeconds: 600,
            continuity: 'UNKNOWN',
          },
        ],
      },
    } as any);
    prisma.vehicleTripWaypoint.findMany.mockResolvedValue(
      line(4).map((coord, index) => ({
        latitude: coord[1],
        longitude: coord[0],
        speedKmh: 40,
        recordedAt: new Date(`2026-08-29T10:00:0${index}.000Z`),
      })),
    );

    const response = await service.getCanonicalRouteForTrip('org-1', 'veh-1', 'trip-1');

    expect(response.continuity.gapCount).toBe(1);
    expect(response.geometry?.coordinates).toHaveLength(1);
  });

  it('returns UNAVAILABLE without geometry when no artifact and no active job', async () => {
    artifactRepository.getRouteArtifact.mockResolvedValue(null);
    prisma.drivingIntelligenceJob.findFirst.mockResolvedValue(null);
    prisma.vehicleTripWaypoint.findMany.mockResolvedValue([]);

    const response = await service.getCanonicalRouteForTrip('org-1', 'veh-1', 'trip-1');

    expect(response.status.processingState).toBe('UNAVAILABLE');
    expect(response.routeQuality).toBeNull();
    expect(response.geometry).toBeNull();
  });
});
