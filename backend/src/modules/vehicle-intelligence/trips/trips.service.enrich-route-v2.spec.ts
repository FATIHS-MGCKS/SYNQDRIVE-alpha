import { DrivingIntelligenceJobRetryableError } from '../driving-intelligence-jobs/driving-intelligence-jobs.errors';
import { TripsService } from './trips.service';

describe('TripsService.enrichTrip — Route V2 wiring (R3)', () => {
  it('AW — canonical path no longer calls legacy global routeMapMatcher', async () => {
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

    const matchResult = {
      legs: [{ distance: 1000, duration: 60, roadClass: 'primary', speedLimit: 50, geometry: [] }],
      totalDistance: 1000,
      confidence: 0.9,
      matchedGeometry: [
        [13.4, 52.52],
        [13.41, 52.53],
      ] as [number, number][],
    };

    const routeArtifactMaterializer = {
      materializeFromMeasuredRoute: jest.fn().mockResolvedValue({
        ok: true,
        action: 'CREATED',
        routeQuality: 'MATCHED',
        matchResult,
      }),
    };

    const service = new TripsService(
      prisma,
      segments as any,
      mapbox as any,
      routeArtifactMaterializer as any,
    );

    await service.enrichTrip('org-1', 'veh-1', 'trip-1');

    expect(routeArtifactMaterializer.materializeFromMeasuredRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tripId: 'trip-1',
      }),
    );
    expect(mapbox.deriveRoadTypeDistribution).toHaveBeenCalledWith(
      matchResult.legs,
      matchResult.totalDistance,
    );
  });

  it('AP/AQ/AR — road type, speeding, distance use materializer match result', async () => {
    const routePoints = [
      { latitude: 52.52, longitude: 13.4, speedKmh: 50, timestamp: '2026-08-01T10:00:00.000Z' },
      { latitude: 52.53, longitude: 13.41, speedKmh: 55, timestamp: '2026-08-01T10:00:07.000Z' },
    ];

    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'trip-1',
          vehicleId: 'veh-1',
          startTime: new Date('2026-08-01T09:00:00.000Z'),
          endTime: new Date('2026-08-01T11:00:00.000Z'),
          distanceKm: null,
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
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    } as any;

    const matchResult = {
      legs: [],
      totalDistance: 2500,
      confidence: 0.88,
      matchedGeometry: [] as [number, number][],
    };

    const mapbox = {
      deriveRoadTypeDistribution: jest.fn().mockReturnValue({
        cityPercent: 10,
        highwayPercent: 80,
        countryPercent: 10,
        cityKm: 0.2,
        highwayKm: 2,
        countryKm: 0.3,
      }),
      analyzeSpeedingSections: jest.fn().mockReturnValue({
        speedingPercent: 0,
        speedingSectionCount: 0,
        speedingDistanceMeters: 0,
        speedingDurationSeconds: 0,
        maxOverSpeedKmh: 0,
        avgOverSpeedKmh: 0,
        speedingExposurePercent: 0,
        sections: [],
      }),
    };

    const service = new TripsService(
      prisma,
      {
        fetchRouteEnrichment: jest.fn().mockResolvedValue(routePoints),
        fetchEnvironmentTemperature: jest.fn().mockResolvedValue([]),
        fetchPerformance: jest.fn().mockResolvedValue([]),
      } as any,
      mapbox as any,
      {
        materializeFromMeasuredRoute: jest.fn().mockResolvedValue({
          ok: true,
          action: 'CREATED',
          routeQuality: 'MATCHED',
          matchResult,
        }),
      } as any,
    );

    const result = await service.enrichTrip('org-1', 'veh-1', 'trip-1');
    expect(mapbox.deriveRoadTypeDistribution).toHaveBeenCalledWith([], 2500);
    expect(mapbox.analyzeSpeedingSections).toHaveBeenCalled();
    expect(result?.mapMatchConfidence).toBe(0.88);
  });

  it('propagates retryable artifact failure for durable DRIVING_ROUTE_ENRICH retry', async () => {
    const routePoints = [
      { latitude: 52.52, longitude: 13.4, speedKmh: 50, timestamp: '2026-08-01T10:00:00.000Z' },
      { latitude: 52.53, longitude: 13.41, speedKmh: 55, timestamp: '2026-08-01T10:00:07.000Z' },
    ];

    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'trip-1',
          vehicleId: 'veh-1',
          startTime: new Date('2026-08-01T09:00:00.000Z'),
          endTime: new Date('2026-08-01T11:00:00.000Z'),
        }),
        update: jest.fn(),
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'veh-1',
          dimoVehicle: { tokenId: 'token-1' },
        }),
      },
      vehicleTripWaypoint: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    } as any;

    const routeArtifactMaterializer = {
      materializeFromMeasuredRoute: jest
        .fn()
        .mockResolvedValueOnce({ ok: false, error: 'mapbox timeout', retryable: true })
        .mockResolvedValueOnce({
          ok: true,
          action: 'CREATED',
          routeQuality: 'FILTERED',
          matchResult: null,
        }),
    };

    const service = new TripsService(
      prisma,
      {
        fetchRouteEnrichment: jest.fn().mockResolvedValue(routePoints),
        fetchEnvironmentTemperature: jest.fn().mockResolvedValue([]),
        fetchPerformance: jest.fn().mockResolvedValue([]),
      } as any,
      { deriveRoadTypeDistribution: jest.fn(), analyzeSpeedingSections: jest.fn() } as any,
      routeArtifactMaterializer as any,
    );

    await expect(service.enrichTrip('org-1', 'veh-1', 'trip-1')).rejects.toBeInstanceOf(
      DrivingIntelligenceJobRetryableError,
    );

    prisma.vehicleTrip.findFirst.mockResolvedValue({
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
    });

    await service.enrichTrip('org-1', 'veh-1', 'trip-1');
    expect(routeArtifactMaterializer.materializeFromMeasuredRoute).toHaveBeenCalledTimes(2);
  });
});
