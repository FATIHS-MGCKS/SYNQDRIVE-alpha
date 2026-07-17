import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { PrismaService } from '@shared/database/prisma.service';
import { STATION_SCOPE_MODE } from '@shared/stations/station-scope.constants';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';

const ORG = 'org1';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
    activityLog: { findMany: jest.fn() },
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

  const stationAccessScope = new StationAccessScopeService(
    prisma,
    new StationScopeService(prisma),
  );

  const service = new StationsService(prisma, stationValidation, stationAccessScope);

  const stationRow = {
    id: STATION_A,
    organizationId: ORG,
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
  };

  const allScope: StationScopeContext = {
    orgId: ORG,
    mode: STATION_SCOPE_MODE.ALL_STATIONS,
    allowedStationIds: null,
    bypassScope: true,
  };

  const assignedScope: StationScopeContext = {
    orgId: ORG,
    mode: STATION_SCOPE_MODE.ASSIGNED_STATIONS,
    allowedStationIds: [STATION_A],
    bypassScope: false,
  };

  const noStationsScope: StationScopeContext = {
    orgId: ORG,
    mode: STATION_SCOPE_MODE.NO_STATIONS,
    allowedStationIds: [],
    bypassScope: false,
  };

  beforeEach(() => jest.clearAllMocks());

  it('lists stations scoped to organization', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue([stationRow]);

    const rows = await service.findAll(ORG, undefined, allScope);
    expect(prisma.station.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG } }),
    );
    expect(rows[0].vehicleCount).toBe(2);
    expect(rows[0].isPrimary).toBe(true);
  });

  it('filters list to ASSIGNED station ids', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue([stationRow]);

    await service.findAll(ORG, undefined, assignedScope);

    expect(prisma.station.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, id: { in: [STATION_A] } },
      }),
    );
  });

  it('returns empty list for NO_STATIONS scope', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue([]);

    const rows = await service.findAll(ORG, undefined, noStationsScope);

    expect(prisma.station.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, id: { in: [] } },
      }),
    );
    expect(rows).toEqual([]);
  });

  it('aggregates stats only across scoped stations', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      { ...stationRow, _count: { vehiclesHome: 3 } },
    ]);
    (prisma.vehicle.count as jest.Mock).mockResolvedValue(0);

    const stats = await service.getStationStats(ORG, assignedScope);

    expect(stats.totalStations).toBe(1);
    expect(stats.unassignedVehicles).toBe(0);
    expect(prisma.station.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          id: { in: [STATION_A] },
          status: { not: 'ARCHIVED' },
        },
      }),
    );
  });

  it('includes org-wide unassigned vehicles only for ALL_STATIONS stats', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.vehicle.count as jest.Mock).mockResolvedValue(4);

    const stats = await service.getStationStats(ORG, allScope);

    expect(stats.unassignedVehicles).toBe(4);
    expect(prisma.vehicle.count).toHaveBeenCalledWith({
      where: { organizationId: ORG, homeStationId: null },
    });
  });

  it('returns not found for cross-tenant or out-of-scope station detail', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(service.findOne(ORG, STATION_B, assignedScope)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('allows archived station detail when still in scope', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      ...stationRow,
      status: 'ARCHIVED',
      archivedAt: new Date(),
    });

    const row = await service.findOne(ORG, STATION_A, assignedScope);
    expect(row.status).toBe('ARCHIVED');
  });

  it('returns operations and team read models for scoped station', async () => {
    (prisma.station.findFirst as jest.Mock)
      .mockResolvedValueOnce({
        pickupEnabled: true,
        returnEnabled: false,
        afterHoursReturnEnabled: false,
        keyBoxAvailable: true,
        capacity: 12,
        radiusMeters: 80,
        openingHours: null,
        holidayRules: null,
        handoverInstructions: 'Ring bell',
        returnInstructions: null,
        timezone: 'Europe/Berlin',
      })
      .mockResolvedValueOnce({
        managerName: 'Alex',
        phone: '+49123',
        email: 'alex@example.com',
      });

    const operations = await service.getStationOperations(ORG, STATION_A, assignedScope);
    const team = await service.getStationTeam(ORG, STATION_A, assignedScope);

    expect(operations.capacity).toBe(12);
    expect(team.managerName).toBe('Alex');
    expect(team.staff).toEqual([]);
  });

  it('lists station activity without cross-station leakage', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      ...stationRow,
    });
    (prisma.activityLog.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'log-1',
        action: 'UPDATE',
        description: 'Updated station',
        createdAt: new Date('2026-07-17T12:00:00.000Z'),
        user: { name: 'Admin', email: 'admin@example.com' },
      },
    ]);

    const activity = await service.getStationActivity(ORG, STATION_A, assignedScope);

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          entity: 'STATION',
          entityId: STATION_A,
        },
      }),
    );
    expect(activity).toHaveLength(1);
  });

  it('returns empty list when scope context is missing (no undefined=all semantics)', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue([]);

    const rows = await service.findAll(ORG);
    expect(prisma.station.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org1', id: { in: [] } },
      }),
    );
    expect(rows).toEqual([]);
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

    const stats = await service.getStationOverviewStats('org1', 's1', allScope);
    expect(stats.vehiclesWithHealthWarnings).toBeNull();
    expect(stats.totalVehicles).toBe(3);
    expect(stats.openTasks).toBe(1);
    expect(stats.hasMissingCoordinates).toBe(true);
    expect(stats.capacityUsagePercent).toBe(30);
  });
});
