import { TripsService } from './trips.service';

describe('TripsService.enrichTrip — Route V2 wiring (R2)', () => {
  it('AD — existing Mapbox matcher invocation behavior unchanged', async () => {
    const routePoints = [
      { latitude: 52.52, longitude: 13.4, speedKmh: 50, timestamp: '2026-08-01T10:00:00.000Z' },
      { latitude: 52.53, longitude: 13.41, speedKmh: 55, timestamp: '2026-08-01T10:00:07.000Z' },
      { latitude: 52.54, longitude: 13.42, speedKmh: 60, timestamp: '2026-08-01T10:00:14.000Z' },
    ];

    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'trip-1',
          vehicleId: 'veh-1',
          startTime: new Date('2026-08-01T09:00:00.000Z'),
          endTime: new Date('2026-08-01T11:00:00.000Z'),
          fuelUsedLiters: null,
          avgConsumptionLPer100Km: null,
          fuelConfidence: null,
          energyUsedKwh: null,
          avgConsumptionKwhPer100Km: null,
          energyConfidence: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'veh-1',
          dimoVehicle: { tokenId: 'token-1' },
        }),
      },
      vehicleTripWaypoint: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    } as any;

    const segments = {
      fetchRouteEnrichment: jest.fn().mockResolvedValue(routePoints),
      fetchEnvironmentTemperature: jest.fn().mockResolvedValue([]),
      fetchPerformance: jest.fn().mockResolvedValue([]),
    };

    const routeMapMatcher = {
      matchRoute: jest.fn().mockResolvedValue({
        legs: [],
        totalDistance: 1000,
        confidence: 0.9,
        matchedGeometry: [],
      }),
    };

    const mapbox = {
      deriveRoadTypeDistribution: jest.fn().mockReturnValue({
        cityPercent: 0,
        highwayPercent: 0,
        countryPercent: 0,
        cityKm: 0,
        highwayKm: 0,
        countryKm: 0,
      }),
      analyzeSpeedingSections: jest.fn().mockReturnValue(null),
    };

    const routeArtifactMaterializer = {
      materializeFromMeasuredRoute: jest.fn().mockResolvedValue({
        ok: true,
        action: 'CREATED',
        routeQuality: 'FILTERED',
      }),
    };

    const service = new TripsService(
      prisma,
      segments as any,
      routeMapMatcher as any,
      mapbox as any,
      routeArtifactMaterializer as any,
    );

    await service.enrichTrip('org-1', 'veh-1', 'trip-1');

    expect(routeArtifactMaterializer.materializeFromMeasuredRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tripId: 'trip-1',
        points: expect.arrayContaining([
          expect.objectContaining({ latitude: 52.52, longitude: 13.4 }),
        ]),
      }),
    );

    expect(routeMapMatcher.matchRoute).toHaveBeenCalledTimes(1);
    expect(routeMapMatcher.matchRoute).toHaveBeenCalledWith(
      routePoints.map((p) => ({
        longitude: p.longitude,
        latitude: p.latitude,
        timestamp: p.timestamp,
      })),
    );
  });
});
