import { BadRequestException } from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('StationValidationService', () => {
  const prisma = {
    station: {
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    vehicle: {
      findFirst: jest.fn(),
    },
  } as unknown as PrismaService;

  const service = new StationValidationService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('rejects archived station for pickup', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      id: 's1',
      name: 'Alt',
      status: 'ARCHIVED',
      pickupEnabled: true,
      returnEnabled: true,
      organizationId: 'org1',
    });

    await expect(
      service.validateBookingStations('org1', { pickupStationId: 's1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects pickup when pickupEnabled is false', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      id: 's1',
      name: 'Nur Rückgabe',
      status: 'ACTIVE',
      pickupEnabled: false,
      returnEnabled: true,
      organizationId: 'org1',
    });

    await expect(
      service.validateBookingStations('org1', { pickupStationId: 's1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('computes isOneWayRental from station ids', async () => {
    (prisma.station.findFirst as jest.Mock)
      .mockResolvedValueOnce({
        id: 'a',
        name: 'A',
        status: 'ACTIVE',
        pickupEnabled: true,
        returnEnabled: true,
      })
      .mockResolvedValueOnce({
        id: 'b',
        name: 'B',
        status: 'ACTIVE',
        pickupEnabled: true,
        returnEnabled: true,
      });

    const result = await service.validateBookingStations('org1', {
      pickupStationId: 'a',
      returnStationId: 'b',
    });
    expect(result.isOneWayRental).toBe(true);
  });
});

describe('StationsService', () => {
  const prisma = {
    station: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    vehicle: {
      count: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    booking: { count: jest.fn(), findMany: jest.fn() },
    orgTask: { count: jest.fn() },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
      fn({
        station: {
          updateMany: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
      }),
    ),
  } as unknown as PrismaService;

  const stationValidation = {
    assertVehicleStationAssignment: jest.fn(),
    getStationForOrg: jest.fn(),
    validateBookingStations: jest.fn(),
  } as unknown as StationValidationService;

  const vehiclesService = {
    loadFleetOperationalContext: jest.fn(),
    mapToCompactOperationalVehicle: jest.fn(),
  } as unknown as import('../vehicles/vehicles.service').VehiclesService;

  const service = new StationsService(prisma, stationValidation, vehiclesService);

  beforeEach(() => jest.clearAllMocks());

  it('lists stations scoped to organization', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      {
        id: 's1',
        organizationId: 'org1',
        name: 'Zentrale',
        code: null,
        status: 'ACTIVE',
        type: 'MAIN',
        isPrimary: true,
        address: 'Str 1',
        addressLine2: null,
        city: 'Berlin',
        postalCode: '10115',
        country: 'DE',
        latitude: 52.5,
        longitude: 13.4,
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
        _count: { vehiclesHome: 2 },
      },
    ]);

    const rows = await service.findAll('org1');
    expect(prisma.station.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org1' } }),
    );
    expect(rows[0].vehicleCount).toBe(2);
    expect(rows[0].isPrimary).toBe(true);
  });

  it('archives instead of hard-deleting linked stations', async () => {
    (prisma.station.findFirst as jest.Mock)
      .mockResolvedValueOnce({
        id: 's1',
        organizationId: 'org1',
        _count: { vehiclesHome: 1, pickupBookings: 0, returnBookings: 0 },
      })
      .mockResolvedValueOnce({
        id: 's1',
        organizationId: 'org1',
        name: 'Alt',
        status: 'ACTIVE',
        type: 'BRANCH',
        isPrimary: false,
        address: null,
        addressLine2: null,
        city: null,
        postalCode: null,
        country: null,
        latitude: null,
        longitude: null,
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
        code: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    (prisma.station.update as jest.Mock).mockResolvedValue({
      id: 's1',
      organizationId: 'org1',
      name: 'Alt',
      status: 'ARCHIVED',
      type: 'BRANCH',
      isPrimary: false,
      address: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      country: null,
      latitude: null,
      longitude: null,
      timezone: 'Europe/Berlin',
      radiusMeters: 100,
      phone: null,
      email: null,
      managerName: null,
      pickupEnabled: false,
      returnEnabled: false,
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
      archivedAt: new Date(),
      code: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { vehiclesHome: 1 },
    });

    const result = await service.delete('org1', 's1');
    expect(result.archived).toBe(true);
    expect(prisma.station.delete).not.toHaveBeenCalled();
  });

  it('returns honest overview stats without fabricating health warnings', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      id: 's1',
      organizationId: 'org1',
      name: 'Zentrale',
      capacity: 10,
      latitude: null,
      longitude: null,
      openingHours: null,
      pickupEnabled: true,
      returnEnabled: false,
    });
    (prisma.vehicle.count as jest.Mock).mockResolvedValue(3);
    (prisma.vehicle.findMany as jest.Mock).mockResolvedValue([{ id: 'v1' }]);
    (prisma.booking.count as jest.Mock).mockResolvedValue(0);
    (prisma.booking.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.orgTask.count as jest.Mock).mockResolvedValue(1);

    const stats = await service.getStationOverviewStats('org1', 's1');
    expect(stats.vehiclesWithHealthWarnings).toBeNull();
    expect(stats.totalVehicles).toBe(3);
    expect(stats.openTasks).toBe(1);
    expect(stats.hasMissingCoordinates).toBe(true);
    expect(stats.capacityUsagePercent).toBe(30);
  });
});
