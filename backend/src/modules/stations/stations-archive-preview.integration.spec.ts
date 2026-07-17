import { NotFoundException } from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { STATION_SCOPE_MODE } from '@shared/stations/station-scope.constants';
import { StationArchivePreviewIssueCode } from './station-archive-preview.types';

const ORG = 'org-archive-preview';
const STATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUCCESSOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('StationsService archive preview', () => {
  const prisma = {
    station: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    vehicle: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    booking: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    orgTask: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    organizationMembership: {
      findMany: jest.fn(),
    },
  } as unknown as PrismaService;

  const service = new StationsService(
    prisma,
    {} as StationValidationService,
    new StationAccessScopeService(prisma, new StationScopeService(prisma)),
  );

  const scope = {
    orgId: ORG,
    mode: STATION_SCOPE_MODE.ALL_STATIONS,
    allowedStationIds: null,
    bypassScope: false,
  };

  const stationRow = {
    id: STATION_ID,
    organizationId: ORG,
    name: 'Zentrale',
    code: 'HQ',
    status: 'ACTIVE',
    isPrimary: false,
    archivedAt: null,
    pickupEnabled: true,
    returnEnabled: true,
    afterHoursReturnEnabled: false,
    keyBoxAvailable: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(stationRow);
    (prisma.station.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.vehicle.count as jest.Mock).mockResolvedValue(0);
    (prisma.vehicle.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.booking.count as jest.Mock).mockResolvedValue(0);
    (prisma.booking.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.orgTask.count as jest.Mock).mockResolvedValue(0);
    (prisma.orgTask.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.organizationMembership.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('returns empty preview for station without links', async () => {
    const result = await service.getStationArchivePreview(ORG, STATION_ID, scope);

    expect(result.archiveAllowed).toBe(true);
    expect(result.alreadyArchived).toBe(false);
    expect(result.partial).toBe(false);
    expect(result.affectedCounts).toEqual({
      homeVehicles: 0,
      presentVehicles: 0,
      expectedVehicles: 0,
      futurePickupBookings: 0,
      futureReturnBookings: 0,
      openHandovers: 0,
      scopedStaff: 0,
      openTasks: 0,
      plannedTransfers: 0,
      activeBookings: 0,
    });
    expect(result.preview.homeVehicles.truncated).toBe(false);
    expect(result.capabilities.pickupEnabled).toBe(true);
  });

  it('returns idempotent preview for archived station', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      ...stationRow,
      status: 'ARCHIVED',
      archivedAt: new Date('2026-07-01T00:00:00.000Z'),
      pickupEnabled: false,
      returnEnabled: false,
    });

    const result = await service.getStationArchivePreview(ORG, STATION_ID, scope);

    expect(result.alreadyArchived).toBe(true);
    expect(result.idempotent).toBe(true);
    expect(result.archiveAllowed).toBe(true);
    expect(result.warnings.some((w) => w.code === 'IDEMPOTENT_ARCHIVE')).toBe(true);
  });

  it('aggregates heavily linked station with partial list hints', async () => {
    (prisma.vehicle.count as jest.Mock).mockImplementation(async ({ where }) => {
      if (where.homeStationId) return 30;
      if (where.currentStationId) return 12;
      if (where.expectedStationId && where.OR) return 5;
      if (where.expectedStationId) return 8;
      return 0;
    });
    (prisma.vehicle.findMany as jest.Mock).mockImplementation(async ({ take }) =>
      Array.from({ length: take ?? 25 }, (_, index) => ({
        id: `vehicle-${index}`,
        vehicleName: `Vehicle ${index}`,
        licensePlate: `M-AB ${index}`,
        status: 'AVAILABLE',
      })),
    );
    (prisma.booking.count as jest.Mock).mockImplementation(async ({ where }) => {
      if (where.pickupStationId) return 40;
      if (where.returnStationId) return 35;
      if (where.handoverProtocols) return 3;
      if (where.status?.in) return 7;
      return 2;
    });
    (prisma.booking.findMany as jest.Mock).mockImplementation(async ({ take }) =>
      Array.from({ length: take ?? 25 }, (_, index) => ({
        id: `booking-${index}`,
        status: 'CONFIRMED',
        startDate: new Date('2026-08-01T10:00:00.000Z'),
        endDate: new Date('2026-08-05T10:00:00.000Z'),
        customer: { firstName: 'Max', lastName: 'Mustermann' },
        vehicle: {
          vehicleName: 'Demo',
          make: 'VW',
          model: 'Golf',
          licensePlate: 'M-XY 1',
        },
      })),
    );
    (prisma.orgTask.count as jest.Mock).mockResolvedValue(9);
    (prisma.orgTask.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 25 }, (_, index) => ({
        id: `task-${index}`,
        title: `Task ${index}`,
        status: 'OPEN',
      })),
    );
    (prisma.organizationMembership.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 4 }, (_, index) => ({
        id: `membership-${index}`,
        role: 'WORKER',
        stationScope: null,
        stationIds: [STATION_ID],
        user: {
          id: `user-${index}`,
          firstName: 'Worker',
          lastName: `${index}`,
          email: `worker${index}@example.com`,
        },
      })),
    );
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      { id: SUCCESSOR_ID, name: 'Nebenstelle', code: 'SUB' },
    ]);
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      ...stationRow,
      isPrimary: true,
    });

    const result = await service.getStationArchivePreview(ORG, STATION_ID, scope);

    expect(result.archiveAllowed).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.affectedCounts.homeVehicles).toBe(30);
    expect(result.affectedCounts.presentVehicles).toBe(12);
    expect(result.affectedCounts.expectedVehicles).toBe(8);
    expect(result.affectedCounts.plannedTransfers).toBe(5);
    expect(result.affectedCounts.futurePickupBookings).toBe(40);
    expect(result.affectedCounts.futureReturnBookings).toBe(35);
    expect(result.affectedCounts.scopedStaff).toBe(4);
    expect(result.affectedCounts.openTasks).toBe(9);
    expect(result.preview.homeVehicles.truncated).toBe(true);
    expect(result.preview.homeVehicles.totalCount).toBe(30);
    expect(result.preview.homeVehicles.items).toHaveLength(25);
    expect(result.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining([
        StationArchivePreviewIssueCode.HOME_VEHICLES_REMAIN,
        StationArchivePreviewIssueCode.FUTURE_PICKUPS_REMAIN,
        StationArchivePreviewIssueCode.SCOPED_STAFF_REMAINS,
      ]),
    );
    expect(result.primaryStatus.successorCandidates).toHaveLength(1);
  });

  it('throws when station is not found for readable scope', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      service.getStationArchivePreview(ORG, STATION_ID, scope),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
