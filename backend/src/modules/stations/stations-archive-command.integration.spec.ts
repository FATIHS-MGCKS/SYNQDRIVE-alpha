import { BadRequestException } from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { STATION_SCOPE_MODE } from '@shared/stations/station-scope.constants';
import {
  StationArchiveCommandIssueCode,
  StationArchiveCommandName,
  StationArchiveCommandOutcome,
} from './station-archive-command.types';

const ORG = 'org-archive-cmd';
const STATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUCCESSOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_ID = 'user-archiver';

describe('StationsService archive command', () => {
  const tx = {
    station: {
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    vehicle: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const prisma = {
    station: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    vehicle: {
      count: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
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
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
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
    type: 'MAIN',
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
    returnEnabled: false,
    afterHoursReturnEnabled: true,
    keyBoxAvailable: true,
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
    _count: { vehiclesHome: 3 },
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
    (tx.station.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (tx.station.update as jest.Mock).mockImplementation(async ({ data }) => ({
      ...stationRow,
      ...data,
    }));
  });

  it('archives station transactionally without mutating vehicles', async () => {
    const result = await service.archiveStation(ORG, STATION_ID, {}, scope, USER_ID);

    expect(result.outcome).toBe(StationArchiveCommandOutcome.APPLIED);
    expect(result.command).toBe(StationArchiveCommandName.ARCHIVE);
    expect(result.station.status).toBe('ARCHIVED');
    expect(result.station.pickupEnabled).toBe(false);
    expect(result.station.returnEnabled).toBe(false);
    expect(result.audit.performedByUserId).toBe(USER_ID);
    expect(result.audit.archivedCapabilitiesSnapshot).toEqual(
      expect.objectContaining({
        pickupEnabled: true,
        returnEnabled: false,
        afterHoursReturnEnabled: true,
        keyBoxAvailable: true,
        isPrimary: false,
        archivedByUserId: USER_ID,
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.station.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: STATION_ID },
        data: expect.objectContaining({
          status: 'ARCHIVED',
          isPrimary: false,
          pickupEnabled: false,
          returnEnabled: false,
          archivedCapabilitiesSnapshot: expect.objectContaining({
            pickupEnabled: true,
            returnEnabled: false,
          }),
          lifecycleMetadata: expect.objectContaining({
            lastArchivedByUserId: USER_ID,
          }),
        }),
      }),
    );
    expect(tx.vehicle.update).not.toHaveBeenCalled();
    expect(tx.vehicle.updateMany).not.toHaveBeenCalled();
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
    expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
  });

  it('is idempotent when station is already archived', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      ...stationRow,
      status: 'ARCHIVED',
      archivedAt: new Date('2026-07-01T00:00:00.000Z'),
      pickupEnabled: false,
      returnEnabled: false,
    });

    const result = await service.archiveStation(ORG, STATION_ID, {}, scope, USER_ID);

    expect(result.outcome).toBe(StationArchiveCommandOutcome.IDEMPOTENT);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.station.update).not.toHaveBeenCalled();
  });

  it('blocks archive when future bookings exist without acknowledgement', async () => {
    (prisma.booking.count as jest.Mock).mockImplementation(async ({ where }) => {
      if (where.pickupStationId) return 2;
      if (where.returnStationId) return 1;
      return 0;
    });

    await expect(
      service.archiveStation(ORG, STATION_ID, {}, scope, USER_ID),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        blockingReasons: expect.arrayContaining([
          expect.objectContaining({
            code: StationArchiveCommandIssueCode.FUTURE_PICKUPS_BLOCK_ARCHIVE,
          }),
          expect.objectContaining({
            code: StationArchiveCommandIssueCode.FUTURE_RETURNS_BLOCK_ARCHIVE,
          }),
        ]),
      }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows archive with acknowledgeFutureBookings override', async () => {
    (prisma.booking.count as jest.Mock).mockImplementation(async ({ where }) => {
      if (where.pickupStationId) return 1;
      return 0;
    });

    const result = await service.archiveStation(
      ORG,
      STATION_ID,
      { acknowledgeFutureBookings: true },
      scope,
      USER_ID,
    );

    expect(result.outcome).toBe(StationArchiveCommandOutcome.APPLIED);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: StationArchiveCommandIssueCode.ACKNOWLEDGED_FUTURE_BOOKINGS,
        }),
      ]),
    );
  });

  it('transfers primary to successor in the same transaction', async () => {
    (prisma.station.findFirst as jest.Mock).mockImplementation(async (args) => {
      if (args?.select?.status) {
        return { status: 'ACTIVE' };
      }
      return { ...stationRow, isPrimary: true };
    });
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      { id: SUCCESSOR_ID, name: 'Nebenstelle', code: 'SUB' },
    ]);

    await service.archiveStation(
      ORG,
      STATION_ID,
      { successorPrimaryStationId: SUCCESSOR_ID },
      scope,
      USER_ID,
    );

    expect(tx.station.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, isPrimary: true },
        data: { isPrimary: false },
      }),
    );
    expect(tx.station.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SUCCESSOR_ID },
        data: { isPrimary: true, status: 'ACTIVE' },
      }),
    );
  });

  it('blocks primary archive without successorPrimaryStationId', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      ...stationRow,
      isPrimary: true,
    });
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      { id: SUCCESSOR_ID, name: 'Nebenstelle', code: 'SUB' },
    ]);

    await expect(
      service.archiveStation(ORG, STATION_ID, {}, scope, USER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deprecated delete always archives without hard delete', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(stationRow);

    const result = await service.delete(ORG, STATION_ID);

    expect(result.archived).toBe(true);
    expect(prisma.station.delete).toBeUndefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
