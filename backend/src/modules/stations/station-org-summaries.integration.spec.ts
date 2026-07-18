import { StationStatus, VehicleStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';
import { StationScopeService } from '@shared/stations/station-scope.service';
import { STATION_SCOPE_MODE } from '@shared/stations/station-scope.constants';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import { StationOrgSummariesLimitCode } from '@shared/stations/station-org-summaries.contract';
import { StationSummaryReadModelService } from './station-summary-read-model.service';

const ORG = 'org-org-summaries';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STATION_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_HOME = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('StationSummaryReadModelService org summaries', () => {
  const prisma = {
    station: { count: jest.fn(), findMany: jest.fn() },
    vehicle: { findMany: jest.fn() },
    booking: { findMany: jest.fn() },
    vehicleStationTransfer: { findMany: jest.fn() },
    orgTask: { count: jest.fn(), findMany: jest.fn() },
  } as unknown as PrismaService;

  const stationAccessScope = new StationAccessScopeService(
    prisma,
    new StationScopeService(prisma),
  );
  const service = new StationSummaryReadModelService(prisma, stationAccessScope);

  const assignedScope: StationScopeContext = {
    orgId: ORG,
    mode: STATION_SCOPE_MODE.ASSIGNED_STATIONS,
    allowedStationIds: [STATION_A, STATION_B],
    bypassScope: false,
  };

  function stationRow(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      organizationId: ORG,
      name: `Station ${id.slice(0, 4)}`,
      code: id === STATION_A ? 'BER-01' : 'MUC-01',
      status: 'ACTIVE' as StationStatus,
      type: 'BRANCH',
      isPrimary: id === STATION_A,
      address: 'Street 1',
      addressLine2: null,
      city: id === STATION_A ? 'Berlin' : 'Munich',
      postalCode: '10178',
      country: 'DE',
      phone: null,
      email: null,
      managerName: null,
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
    (prisma.station.count as jest.Mock).mockResolvedValue(2);
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      stationRow(STATION_A),
      stationRow(STATION_B, { latitude: null, longitude: null }),
    ]);
    (prisma.vehicle.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'v-home-a',
        homeStationId: STATION_A,
        currentStationId: STATION_A,
        expectedStationId: null,
        status: VehicleStatus.AVAILABLE,
      },
      {
        id: 'v-foreign-a',
        homeStationId: OTHER_HOME,
        currentStationId: STATION_A,
        expectedStationId: null,
        status: VehicleStatus.AVAILABLE,
      },
      {
        id: 'v-home-b',
        homeStationId: STATION_B,
        currentStationId: STATION_B,
        expectedStationId: null,
        status: VehicleStatus.AVAILABLE,
      },
    ]);
    (prisma.booking.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'b-pickup-a',
        status: 'CONFIRMED',
        pickupStationId: STATION_A,
        returnStationId: OTHER_HOME,
        startDate: new Date('2026-07-18T08:00:00.000Z'),
        endDate: new Date('2026-07-20T18:00:00.000Z'),
      },
      {
        id: 'b-return-b',
        status: 'ACTIVE',
        pickupStationId: OTHER_HOME,
        returnStationId: STATION_B,
        startDate: new Date('2026-07-16T08:00:00.000Z'),
        endDate: new Date('2026-07-18T18:00:00.000Z'),
      },
    ]);
    (prisma.vehicleStationTransfer.findMany as jest.Mock).mockResolvedValue([
      {
        id: 't-in-a',
        fromStationId: OTHER_HOME,
        toStationId: STATION_A,
        status: 'PLANNED',
      },
    ]);
    (prisma.orgTask.findMany as jest.Mock).mockResolvedValue([
      { id: 'task-a', vehicleId: 'v-home-a', bookingId: null, metadata: null },
      { id: 'task-b', vehicleId: null, bookingId: null, metadata: { stationId: STATION_B } },
    ]);
  });

  it('returns org summaries with global KPIs, warnings, partial data, and pagination metadata', async () => {
    const result = await service.resolveForOrganization(
      ORG,
      { page: 1, pageSize: 20 },
      assignedScope,
      { at: '2026-07-18T12:00:00.000Z' },
    );

    expect(result.organizationId).toBe(ORG);
    expect(result.stationSummaries).toHaveLength(2);
    expect(result.globalKpis.stationCount).toBe(2);
    expect(result.globalKpis.homeFleetCount).toBe(2);
    expect(result.globalKpis.foreignVehiclesOnSiteCount).toBe(1);
    expect(result.warningCounts.stationsWithConfigurationProblems).toBe(1);
    expect(result.partialData.complete).toBe(true);
    expect(result.pagination.total).toBe(2);
    expect(result.scope.mode).toBe('SCOPED_STATIONS');
    expect(result.frontendRecomputation).toBe(false);
  });

  it('filters by configuration problems without extra per-station queries', async () => {
    const result = await service.resolveForOrganization(
      ORG,
      { hasConfigurationProblems: true },
      assignedScope,
      { at: '2026-07-18T12:00:00.000Z' },
    );

    expect(result.stationSummaries).toHaveLength(1);
    expect(result.stationSummaries[0]?.stationId).toBe(STATION_B);
    expect(result.globalKpis.stationCount).toBe(1);
    expect(result.pagination.total).toBe(1);
  });

  it('applies search and status filters at the database layer', async () => {
    await service.resolveForOrganization(
      ORG,
      { search: 'Berlin', status: 'ACTIVE', isPrimary: true },
      assignedScope,
    );

    expect(prisma.station.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG,
          status: 'ACTIVE',
          isPrimary: true,
          OR: expect.arrayContaining([
            expect.objectContaining({ name: expect.objectContaining({ contains: 'Berlin' }) }),
          ]),
        }),
      }),
    );
  });

  it('exposes aggregation cap metadata transparently', async () => {
    (prisma.station.count as jest.Mock).mockResolvedValue(600);
    (prisma.station.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 3 }, (_, index) => stationRow(`station-${index}`)),
    );

    const result = await service.resolveForOrganization(ORG, {}, assignedScope);

    expect(result.limits.matchedStationCount).toBe(600);
    expect(result.limits.processedStationCount).toBe(3);
    expect(result.limits.aggregationStationCapApplied).toBe(true);
    expect(result.limits.codes).toContain(StationOrgSummariesLimitCode.AGGREGATION_STATION_CAP);
  });
});

describe('StationSummaryReadModelService org summaries performance', () => {
  const prisma = {
    station: { count: jest.fn(), findMany: jest.fn() },
    vehicle: { findMany: jest.fn() },
    booking: { findMany: jest.fn() },
    vehicleStationTransfer: { findMany: jest.fn() },
    orgTask: { count: jest.fn(), findMany: jest.fn() },
  } as unknown as PrismaService;

  const stationAccessScope = new StationAccessScopeService(
    prisma,
    new StationScopeService(prisma),
  );
  const service = new StationSummaryReadModelService(prisma, stationAccessScope);

  const allScope: StationScopeContext = {
    orgId: ORG,
    mode: STATION_SCOPE_MODE.ALL_STATIONS,
    allowedStationIds: null,
    bypassScope: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const stations = [STATION_A, STATION_B, STATION_C].map((id) => ({
      id,
      organizationId: ORG,
      name: id,
      code: null,
      status: 'ACTIVE' as StationStatus,
      type: 'BRANCH',
      isPrimary: false,
      address: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      country: 'DE',
      phone: null,
      email: null,
      managerName: null,
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
    }));

    (prisma.station.count as jest.Mock).mockResolvedValue(stations.length);
    (prisma.station.findMany as jest.Mock).mockResolvedValue(stations);
    (prisma.vehicle.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.booking.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.vehicleStationTransfer.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.orgTask.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('uses a fixed number of batch queries regardless of station count', async () => {
    await service.resolveForOrganization(ORG, {}, allScope, {
      at: '2026-07-18T12:00:00.000Z',
    });

    expect(prisma.station.count).toHaveBeenCalledTimes(1);
    expect(prisma.station.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.vehicle.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.booking.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.vehicleStationTransfer.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.orgTask.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.orgTask.count).not.toHaveBeenCalled();
  });
});
