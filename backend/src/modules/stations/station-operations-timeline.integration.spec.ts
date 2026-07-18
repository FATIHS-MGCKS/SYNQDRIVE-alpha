import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { STATION_SCOPE_MODE } from '@shared/stations/station-scope.constants';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import { StationOperationsTimelineEntryType } from '@shared/stations/station-operations-timeline.contract';
import { StationOperationsTimelineService } from './station-operations-timeline.service';

const ORG = 'org-timeline';
const STATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_STATION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FOREIGN_STATION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('StationOperationsTimelineService', () => {
  const prisma = {
    station: { findFirst: jest.fn() },
    booking: { findMany: jest.fn() },
    vehicleStationTransfer: { findMany: jest.fn() },
    orgTask: { findMany: jest.fn() },
    vehicle: { findMany: jest.fn() },
    bookingHandoverProtocol: { findMany: jest.fn() },
  } as unknown as PrismaService;

  const stationAccessScope = new StationAccessScopeService(
    prisma,
    new StationScopeService(prisma),
  );
  const service = new StationOperationsTimelineService(prisma, stationAccessScope);

  const assignedScope: StationScopeContext = {
    orgId: ORG,
    mode: STATION_SCOPE_MODE.ASSIGNED_STATIONS,
    allowedStationIds: [STATION],
    bypassScope: false,
  };

  const vehicle = {
    licensePlate: 'B-TL 100',
    vehicleName: null,
    make: 'Audi',
    model: 'A3',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({
      id: STATION,
      organizationId: ORG,
      timezone: 'Europe/Berlin',
    });
    (prisma.booking.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'booking-pickup',
        status: 'CONFIRMED',
        vehicleId: 'vehicle-1',
        pickupStationId: STATION,
        returnStationId: OTHER_STATION,
        isOneWayRental: false,
        startDate: new Date('2026-07-18T08:00:00.000Z'),
        endDate: new Date('2026-07-20T18:00:00.000Z'),
        stationBookingRulesSnapshot: null,
        vehicle,
      },
      {
        id: 'booking-overdue',
        status: 'ACTIVE',
        vehicleId: 'vehicle-2',
        pickupStationId: OTHER_STATION,
        returnStationId: STATION,
        isOneWayRental: false,
        startDate: new Date('2026-07-10T08:00:00.000Z'),
        endDate: new Date('2026-07-17T10:00:00.000Z'),
        stationBookingRulesSnapshot: null,
        vehicle,
      },
    ]);
    (prisma.vehicleStationTransfer.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'transfer-in',
        vehicleId: 'vehicle-3',
        fromStationId: OTHER_STATION,
        toStationId: STATION,
        status: 'PLANNED',
        plannedAt: new Date('2026-07-18T14:00:00.000Z'),
        expectedArrivalAt: new Date('2026-07-18T16:00:00.000Z'),
        startedAt: null,
        completedAt: null,
        sourceBookingId: null,
        vehicle,
      },
    ]);
    (prisma.vehicle.findMany as jest.Mock)
      .mockResolvedValueOnce([{ id: 'vehicle-1' }])
      .mockResolvedValueOnce([{ id: 'booking-pickup' }, { id: 'booking-overdue' }])
      .mockResolvedValueOnce([]);
    (prisma.orgTask.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'task-1',
        type: 'VEHICLE_CLEANING',
        status: 'OPEN',
        title: 'Clean',
        vehicleId: 'vehicle-1',
        bookingId: null,
        dueDate: new Date('2026-07-18T17:00:00.000Z'),
        activatesAt: new Date('2026-07-18T10:00:00.000Z'),
        metadata: { stationId: STATION },
      },
    ]);
    (prisma.bookingHandoverProtocol.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);
  });

  it('returns a scoped timeline read model with station timezone and pagination metadata', async () => {
    const result = await service.resolveForStation(
      ORG,
      STATION,
      {
        from: '2026-07-17T00:00:00.000Z',
        to: '2026-07-25T23:59:59.999Z',
        page: 1,
        pageSize: 10,
        sortOrder: 'asc',
        at: '2026-07-18T12:00:00.000Z',
      },
      assignedScope,
    );

    expect(result.version).toBe(1);
    expect(result.stationId).toBe(STATION);
    expect(result.organizationId).toBe(ORG);
    expect(result.window.timezone).toBe('Europe/Berlin');
    expect(result.scope.applied).toBe(true);
    expect(result.scope.mode).toBe('SCOPED_STATIONS');
    expect(result.frontendRecomputation).toBe(false);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.pageSize).toBe(10);

    const types = result.entries.map((entry) => entry.type);
    expect(types).toContain(StationOperationsTimelineEntryType.PICKUP);
    expect(types).toContain(StationOperationsTimelineEntryType.OVERDUE_RETURN);
    expect(types).toContain(StationOperationsTimelineEntryType.TRANSFER_ARRIVAL);
    expect(types).toContain(StationOperationsTimelineEntryType.OPERATIONAL_TASK);

    for (const entry of result.entries) {
      expect(entry.instantUtc).toEqual(expect.any(String));
      expect(entry.stationLocalTime).toEqual(expect.any(String));
      expect(entry.stationLocalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.deepLink).toMatch(/^\/operator\//);
    }
  });

  it('exposes contract metadata', () => {
    const metadata = service.getContractMetadata();
    expect(metadata.version).toBe(1);
    expect(metadata.entryTypes).toContain(StationOperationsTimelineEntryType.PICKUP);
    expect(metadata.frontendRecomputation).toBe(false);
  });

  it('rejects stations outside assigned scope', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      service.resolveForStation(ORG, FOREIGN_STATION, {}, assignedScope),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
