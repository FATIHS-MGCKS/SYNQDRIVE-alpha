import { NotFoundException } from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { PrismaService } from '@shared/database/prisma.service';
import { STATION_SCOPE_MODE } from '@shared/stations/station-scope.constants';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { StationOperationsService } from './station-operations.service';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VEHICLE_X = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('Stations nested resource security', () => {
  const prisma = {
    station: { findFirst: jest.fn(), findMany: jest.fn() },
    vehicle: { findMany: jest.fn(), count: jest.fn() },
    booking: { findMany: jest.fn(), count: jest.fn() },
    orgTask: { count: jest.fn() },
    activityLog: { findMany: jest.fn() },
  } as unknown as PrismaService;

  const stationAccessScope = new StationAccessScopeService(
    prisma,
    new StationScopeService(prisma),
  );

  const stationOperations = new StationOperationsService(prisma, stationAccessScope);

  const service = new StationsService(
    prisma,
    {} as StationValidationService,
    stationAccessScope,
    stationOperations,
  );

  const assignedScope: StationScopeContext = {
    orgId: ORG,
    mode: STATION_SCOPE_MODE.ASSIGNED_STATIONS,
    allowedStationIds: [STATION_A],
    bypassScope: false,
  };

  const stationRow = {
    id: STATION_A,
    organizationId: ORG,
    status: 'ACTIVE',
    capacity: 10,
    latitude: 1,
    longitude: 2,
    openingHours: null,
    pickupEnabled: true,
    returnEnabled: true,
    managerName: 'Alex',
    phone: null,
    email: null,
    afterHoursReturnEnabled: false,
    keyBoxAvailable: false,
    radiusMeters: 100,
    holidayRules: null,
    handoverInstructions: null,
    returnInstructions: null,
    timezone: 'Europe/Berlin',
  };

  beforeEach(() => jest.clearAllMocks());

  function mockReadableStation(overrides: Record<string, unknown> = {}) {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      ...stationRow,
      ...overrides,
    });
  }

  it('returns 404 for out-of-scope station on fleet (no cross-station leak)', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(service.getStationFleet(ORG, STATION_B, assignedScope)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.vehicle.findMany).not.toHaveBeenCalled();
  });

  it('returns 404 for cross-org station on bookings', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      service.getStationBookings(OTHER_ORG, STATION_A, assignedScope),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
  });

  it('scopes fleet to station linkage including expectedStationId', async () => {
    mockReadableStation();
    (prisma.vehicle.findMany as jest.Mock).mockResolvedValue([]);

    await service.getStationFleet(ORG, STATION_A, assignedScope);

    expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          OR: [
            { homeStationId: STATION_A },
            { currentStationId: STATION_A },
            { expectedStationId: STATION_A },
          ],
        },
      }),
    );
  });

  it('does not return fleet vehicles when only vehicleId would bypass station scope', async () => {
    mockReadableStation();
    (prisma.vehicle.findMany as jest.Mock).mockResolvedValue([]);

    await service.getStationFleet(ORG, STATION_A, assignedScope);

    const where = (prisma.vehicle.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where).not.toHaveProperty('id', VEHICLE_X);
    expect(where.OR).toEqual(
      expect.arrayContaining([{ homeStationId: STATION_A }]),
    );
  });

  it('allows historical bookings on archived stations in scope', async () => {
    mockReadableStation({ status: 'ARCHIVED' });
    (prisma.booking.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'b1',
        status: 'COMPLETED',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-02'),
        pickupStationId: STATION_A,
        returnStationId: STATION_B,
        isOneWayRental: true,
        customer: { firstName: 'Max', lastName: 'Muster' },
        vehicle: { vehicleName: null, make: 'VW', model: 'Golf', licensePlate: 'B-XX 1' },
      },
    ]);

    const rows = await service.getStationBookings(ORG, STATION_A, assignedScope);

    expect(rows).toHaveLength(1);
    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          OR: [{ pickupStationId: STATION_A }, { returnStationId: STATION_A }],
        },
      }),
    );
  });

  it('scopes overview pickup/return counts and tasks to the same station access', async () => {
    mockReadableStation();
    (prisma.vehicle.findMany as jest.Mock).mockResolvedValue([{ id: VEHICLE_X }]);
    (prisma.booking.findMany as jest.Mock).mockResolvedValue([{ id: 'b1' }]);
    (prisma.vehicle.count as jest.Mock).mockResolvedValue(1);
    (prisma.booking.count as jest.Mock).mockResolvedValue(2);
    (prisma.orgTask.count as jest.Mock).mockResolvedValue(3);

    const stats = await service.getStationOverviewStats(ORG, STATION_A, assignedScope);

    expect(stats.todayPickups).toBe(2);
    expect(stats.openTasks).toBe(3);
    expect(prisma.booking.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG,
          pickupStationId: STATION_A,
        }),
      }),
    );
    expect(prisma.orgTask.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG,
          OR: expect.arrayContaining([
            { metadata: { path: ['stationId'], equals: STATION_A } },
            { vehicleId: { in: [VEHICLE_X] } },
            { bookingId: { in: ['b1'] } },
          ]),
        }),
      }),
    );
  });

  it('returns 404 for out-of-scope overview stats without leaking counts', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      service.getStationOverviewStats(ORG, STATION_B, assignedScope),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.vehicle.count).not.toHaveBeenCalled();
    expect(prisma.booking.count).not.toHaveBeenCalled();
  });

  it('scopes team and operations through readable station guard', async () => {
    mockReadableStation();
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      managerName: 'Alex',
      phone: '+49123',
      email: 'alex@example.com',
    });

    const team = await service.getStationTeam(ORG, STATION_A, assignedScope);
    expect(team.managerName).toBe('Alex');

    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      id: STATION_A,
      organizationId: ORG,
      status: 'ACTIVE',
      pickupEnabled: true,
      returnEnabled: false,
      afterHoursReturnEnabled: false,
      keyBoxAvailable: true,
      capacity: 5,
      radiusMeters: 80,
      openingHours: null,
      holidayRules: null,
      timezone: 'Europe/Berlin',
      latitude: 52.5,
      longitude: 13.4,
      calendarExceptions: [],
    });
    (prisma.vehicle.findMany as jest.Mock).mockResolvedValue([]);

    const operations = await service.getStationOperations(ORG, STATION_A, assignedScope);
    expect(operations.capacityStatus.configuredCapacity).toBe(5);
  });

  it('scopes activity logs to station entity without cross-station leakage', async () => {
    mockReadableStation();
    (prisma.activityLog.findMany as jest.Mock).mockResolvedValue([]);

    await service.getStationActivity(ORG, STATION_A, assignedScope);

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          entity: 'STATION',
          entityId: STATION_A,
        },
      }),
    );
  });
});
