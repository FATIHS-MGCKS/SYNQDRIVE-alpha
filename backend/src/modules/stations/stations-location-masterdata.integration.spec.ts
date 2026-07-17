import { BadRequestException } from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { StationCoordinatesSource } from '@prisma/client';
import { parseMapboxForwardGeocodeFeature } from './station-geocode.util';

const ORG = 'org-location';
const STATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('StationsService location master data', () => {
  const txStation = {
    updateMany: jest.fn(),
    create: jest.fn(),
  };
  const tx = {
    station: txStation,
    $executeRaw: jest.fn().mockResolvedValue(1),
  };

  const prisma = {
    station: {
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;

  const service = new StationsService(
    prisma,
    {} as StationValidationService,
    new StationAccessScopeService(prisma, new StationScopeService(prisma)),
  );

  const baseRow = {
    id: STATION_ID,
    organizationId: ORG,
    name: 'Depot',
    code: null,
    status: 'ACTIVE',
    type: 'BRANCH',
    isPrimary: false,
    address: 'Musterstraße 1',
    addressLine2: null,
    city: 'Berlin',
    postalCode: '10115',
    country: 'DE',
    latitude: null,
    longitude: null,
    coordinatesSource: null,
    coordinatesConfirmedAt: null,
    timezone: 'Europe/Berlin',
    radiusMeters: 100,
    phone: null,
    email: null,
    managerName: null,
    pickupEnabled: true,
    returnEnabled: true,
    afterHoursReturnEnabled: false,
    keyBoxAvailable: false,
    capacity: null,
    openingHours: null,
    holidayRules: null,
    handoverInstructions: null,
    returnInstructions: null,
    notes: null,
    internalNotes: null,
    googlePlaceId: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { vehiclesHome: 0 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(null);
    txStation.create.mockImplementation(async ({ data }) => ({ ...baseRow, ...data, _count: { vehiclesHome: 0 } }));
    (prisma.station.findFirstOrThrow as jest.Mock).mockResolvedValue(baseRow);
    (prisma.station.update as jest.Mock).mockImplementation(async ({ data }) => ({
      ...baseRow,
      ...data,
      _count: { vehiclesHome: 0 },
    }));
  });

  afterEach(() => {
    delete process.env.MAPBOX_ACCESS_TOKEN;
    jest.restoreAllMocks();
  });

  it('sets MANUAL provenance when explicit coordinates are provided on create', async () => {
    const result = await service.create(ORG, {
      name: 'Depot',
      latitude: 52.52,
      longitude: 13.405,
    });

    expect(txStation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          latitude: 52.52,
          longitude: 13.405,
          coordinatesSource: StationCoordinatesSource.MANUAL,
          coordinatesConfirmedAt: expect.any(Date),
        }),
      }),
    );
    expect(result.coordinatesSource).toBe(StationCoordinatesSource.MANUAL);
    expect(result.hasMissingCoordinates).toBe(false);
  });

  it('sets FORWARD_GEOCODE provenance when auto-geocoding on create', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ center: [13.405, 52.52], relevance: 0.9 }],
      }),
    });

    await service.create(ORG, {
      name: 'Depot',
      address: 'Musterstraße 1',
      city: 'Berlin',
      postalCode: '10115',
    });

    expect(txStation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          latitude: 52.52,
          longitude: 13.405,
          coordinatesSource: StationCoordinatesSource.FORWARD_GEOCODE,
          coordinatesConfirmedAt: null,
        }),
      }),
    );
  });

  it('does not auto-apply low-relevance forward geocode results', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ center: [13.405, 52.52], relevance: 0.2 }],
      }),
    });

    await service.create(ORG, {
      name: 'Depot',
      address: 'Musterstraße 1',
      city: 'Berlin',
    });

    expect(txStation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          latitude: expect.any(Number),
        }),
      }),
    );
  });

  it('rejects out-of-range geofence radius on update', async () => {
    await expect(
      service.update(ORG, STATION_ID, { radiusMeters: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.station.update).not.toHaveBeenCalled();
  });

  it('exposes hasMissingCoordinates on station DTO', async () => {
    const result = await service.create(ORG, { name: 'No Geo' });
    expect(result.hasMissingCoordinates).toBe(true);
  });

  it('exposes geofenceCapability NOT_CONFIGURED when coordinates are missing', async () => {
    const result = await service.create(ORG, { name: 'No Geo' });
    expect(result.geofenceCapability.status).toBe('NOT_CONFIGURED');
    expect(result.geofenceCapability.allowsAutomaticLocationDetectionClaim).toBe(false);
    expect(result.geofenceCapability.uiHint).toContain('keine automatische Standorterkennung');
  });

  it('exposes geofenceCapability CONFIGURED_ONLY when coordinates and radius exist', async () => {
    const result = await service.create(ORG, {
      name: 'Geo Station',
      latitude: 52.52,
      longitude: 13.405,
      radiusMeters: 150,
    });
    expect(result.geofenceCapability.status).toBe('CONFIGURED_ONLY');
    expect(result.geofenceCapability.geofenceConfigured).toBe(true);
    expect(result.geofenceCapability.writesCurrentStationId).toBe(false);
    expect(result.geofenceCapability.allowsAutomaticLocationDetectionClaim).toBe(false);
    expect(result.geofenceCapability.uiHint).toContain('keine automatische Standorterkennung aktiv');
  });
});

describe('parseMapboxForwardGeocodeFeature', () => {
  it('rejects low relevance', () => {
    expect(
      parseMapboxForwardGeocodeFeature({ center: [13.4, 52.5], relevance: 0.1 }),
    ).toBeNull();
  });

  it('accepts high relevance', () => {
    expect(
      parseMapboxForwardGeocodeFeature({ center: [13.4, 52.5], relevance: 0.8 }),
    ).toEqual({ latitude: 52.5, longitude: 13.4 });
  });
});
