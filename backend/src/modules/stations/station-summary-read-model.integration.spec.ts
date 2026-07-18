import { NotFoundException } from '@nestjs/common';
import { StationStatus, VehicleStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { STATION_SCOPE_MODE } from '@shared/stations/station-scope.constants';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import { StationSummaryReadModelService } from './station-summary-read-model.service';

const ORG = 'org-summary';
const STATION_ACTIVE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_ARCHIVED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STATION_FOREIGN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_HOME = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('StationSummaryReadModelService', () => {
  const prisma = {
    station: { findFirst: jest.fn() },
    vehicle: { findMany: jest.fn() },
    booking: { findMany: jest.fn() },
    vehicleStationTransfer: { findMany: jest.fn() },
    orgTask: { count: jest.fn() },
  } as unknown as PrismaService;

  const stationAccessScope = new StationAccessScopeService(
    prisma,
    new StationScopeService(prisma),
  );
  const service = new StationSummaryReadModelService(prisma, stationAccessScope);

  const assignedScope: StationScopeContext = {
    orgId: ORG,
    mode: STATION_SCOPE_MODE.ASSIGNED_STATIONS,
    allowedStationIds: [STATION_ACTIVE, STATION_ARCHIVED],
    bypassScope: false,
  };

  function stationRow(overrides: Record<string, unknown> = {}) {
    return {
      id: STATION_ACTIVE,
      organizationId: ORG,
      name: 'Berlin Mitte',
      code: 'BER-01',
      status: 'ACTIVE' as StationStatus,
      type: 'BRANCH',
      isPrimary: false,
      address: 'Alexanderplatz 1',
      addressLine2: null,
      city: 'Berlin',
      postalCode: '10178',
      country: 'DE',
      phone: '+49 30 123',
      email: 'berlin@example.com',
      managerName: 'Alex',
      timezone: 'Europe/Berlin',
      capacity: 5,
      archivedAt: null,
      pickupEnabled: true,
      returnEnabled: true,
      afterHoursReturnEnabled: false,
      keyBoxAvailable: false,
      openingHours: {
        version: 2,
        friday: { slots: [{ open: '09:00', close: '18:00' }] },
      },
      holidayRules: null,
      latitude: 52.52,
      longitude: 13.405,
      radiusMeters: 150,
      calendarExceptions: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(stationRow());
    (prisma.vehicle.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'v-home',
        homeStationId: STATION_ACTIVE,
        currentStationId: STATION_ACTIVE,
        expectedStationId: null,
        status: VehicleStatus.AVAILABLE,
      },
      {
        id: 'v-foreign',
        homeStationId: OTHER_HOME,
        currentStationId: STATION_ACTIVE,
        expectedStationId: null,
        status: VehicleStatus.AVAILABLE,
      },
      {
        id: 'v-rented',
        homeStationId: STATION_ACTIVE,
        currentStationId: OTHER_HOME,
        expectedStationId: null,
        status: VehicleStatus.RENTED,
      },
    ]);
    (prisma.booking.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'b-pickup-today',
        status: 'CONFIRMED',
        pickupStationId: STATION_ACTIVE,
        returnStationId: OTHER_HOME,
        startDate: new Date('2026-07-18T08:00:00.000Z'),
        endDate: new Date('2026-07-20T18:00:00.000Z'),
      },
      {
        id: 'b-return-today',
        status: 'ACTIVE',
        pickupStationId: OTHER_HOME,
        returnStationId: STATION_ACTIVE,
        startDate: new Date('2026-07-16T08:00:00.000Z'),
        endDate: new Date('2026-07-18T18:00:00.000Z'),
      },
      {
        id: 'b-overdue',
        status: 'ACTIVE',
        pickupStationId: OTHER_HOME,
        returnStationId: STATION_ACTIVE,
        startDate: new Date('2026-07-10T08:00:00.000Z'),
        endDate: new Date('2026-07-17T10:00:00.000Z'),
      },
    ]);
    (prisma.vehicleStationTransfer.findMany as jest.Mock).mockResolvedValue([
      {
        id: 't-in',
        fromStationId: OTHER_HOME,
        toStationId: STATION_ACTIVE,
        status: 'PLANNED',
      },
      {
        id: 't-out',
        fromStationId: STATION_ACTIVE,
        toStationId: OTHER_HOME,
        status: 'IN_TRANSIT',
      },
    ]);
    (prisma.orgTask.count as jest.Mock).mockResolvedValue(4);
  });

  it('builds a consistent summary for an active station', async () => {
    const summary = await service.resolveForStation(ORG, STATION_ACTIVE, assignedScope, {
      at: '2026-07-18T12:00:00.000Z',
    });

    expect(summary.masterData.name).toBe('Berlin Mitte');
    expect(summary.lifecycle.archived).toBe(false);
    expect(summary.openingStatus.status).toBeDefined();
    expect(summary.operationalCapabilities.pickup.available).toBeDefined();
    expect(summary.kpis.metrics.homeFleetCount.value).toBe(2);
    expect(summary.kpis.metrics.currentOnSiteCount.value).toBe(2);
    expect(summary.kpis.metrics.foreignVehiclesOnSiteCount.value).toBe(1);
    expect(summary.kpis.metrics.currentlyRentedHomeVehicles.value).toBe(1);
    expect(summary.kpis.metrics.pickupsToday.value).toBe(1);
    expect(summary.kpis.metrics.returnsToday.value).toBe(1);
    expect(summary.kpis.metrics.overdueReturns.value).toBe(1);
    expect(summary.kpis.metrics.incomingTransfers.value).toBe(1);
    expect(summary.kpis.metrics.outgoingTransfers.value).toBe(1);
    expect(summary.kpis.metrics.openOperationalTasks.value).toBe(4);
    expect(summary.partialData.complete).toBe(true);
    expect(summary.lastCalculatedAt).toBe('2026-07-18T12:00:00.000Z');
    expect(summary.frontendRecomputation).toBe(false);
    expect(summary.scope.mode).toBe('SCOPED_STATIONS');

    expect(prisma.vehicle.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.booking.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.vehicleStationTransfer.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.orgTask.count).toHaveBeenCalledTimes(1);
  });

  it('marks archived stations clearly in lifecycle', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(
      stationRow({
        id: STATION_ARCHIVED,
        status: 'ARCHIVED',
        archivedAt: new Date('2026-06-01T00:00:00.000Z'),
        latitude: null,
        longitude: null,
      }),
    );

    const summary = await service.resolveForStation(ORG, STATION_ARCHIVED, assignedScope, {
      at: '2026-07-18T12:00:00.000Z',
    });

    expect(summary.lifecycle.archived).toBe(true);
    expect(summary.lifecycle.status).toBe('ARCHIVED');
    expect(summary.lifecycle.archivedAt).toBe('2026-06-01T00:00:00.000Z');
    expect(summary.configurationProblems.length).toBeGreaterThan(0);
  });

  it('rejects stations outside assigned scope', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      service.resolveForStation(ORG, STATION_FOREIGN, assignedScope),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('surfaces configuration problems for stations missing coordinates', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(
      stationRow({ latitude: null, longitude: null }),
    );

    const summary = await service.resolveForStation(ORG, STATION_ACTIVE, assignedScope, {
      at: '2026-07-18T12:00:00.000Z',
    });

    expect(
      summary.configurationProblems.some((problem) => problem.code.includes('COORDINATES')),
    ).toBe(true);
  });

  it('uses station timezone for today KPIs', async () => {
    (prisma.booking.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'b-edge',
        status: 'CONFIRMED',
        pickupStationId: STATION_ACTIVE,
        returnStationId: OTHER_HOME,
        startDate: new Date('2026-07-17T22:30:00.000Z'),
        endDate: new Date('2026-07-20T18:00:00.000Z'),
      },
    ]);

    const summary = await service.resolveForStation(ORG, STATION_ACTIVE, assignedScope, {
      at: '2026-07-18T01:00:00.000Z',
    });

    expect(summary.kpis.calendarDay).toBe('2026-07-18');
    expect(summary.kpis.metrics.pickupsToday.value).toBe(1);
  });
});
