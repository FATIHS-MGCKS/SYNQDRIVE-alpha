import { StationsService } from '@modules/stations/stations.service';
import { StationValidationService } from '@modules/stations/station-validation.service';
import { StationAccessScopeService } from './station-access-scope.service';
import { StationScopeService } from './station-scope.service';
import { STATION_SCOPE_MODE } from './station-scope.constants';
import { stationDomainAuditServiceMock } from './testing/station-domain-audit.service.mock';
import { stationOperationsServiceMock } from '../../modules/stations/testing/station-operations.service.mock';

const ORG = 'org-1';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('Station access scope integration (stations list + stats)', () => {
  const prisma = {
    station: { findMany: jest.fn() },
    vehicle: { count: jest.fn() },
  };

  const stationScopeService = new StationScopeService({} as never);
  const stationAccessScope = new StationAccessScopeService(
    prisma as never,
    stationScopeService,
  );

  const stationsService = new StationsService(
    prisma as never,
    {} as StationValidationService,
    stationAccessScope,
    stationOperationsServiceMock,
    { resolveRuntimeSnapshots: jest.fn().mockResolvedValue([]) } as never,
    stationDomainAuditServiceMock as never,
  );

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

  beforeEach(() => jest.clearAllMocks());

  it('uses the same access scope filter for list and stats', async () => {
    prisma.station.findMany.mockResolvedValue([stationRow]);
    prisma.vehicle.count.mockResolvedValue(0);

    const scope = {
      orgId: ORG,
      mode: STATION_SCOPE_MODE.ASSIGNED_STATIONS,
      allowedStationIds: [STATION_A],
      bypassScope: false,
    };

    await stationsService.findAll(ORG, undefined, scope);
    await stationsService.getStationStats(ORG, scope);

    const listWhere = prisma.station.findMany.mock.calls[0][0].where;
    const statsWhere = prisma.station.findMany.mock.calls[1][0].where;

    expect(listWhere).toEqual({
      organizationId: ORG,
      id: { in: [STATION_A] },
    });
    expect(statsWhere).toEqual({
      organizationId: ORG,
      id: { in: [STATION_A] },
      status: { not: 'ARCHIVED' },
    });
  });

  it('returns empty list and zero unassigned for NO_STATIONS without org-wide leakage', async () => {
    prisma.station.findMany.mockResolvedValue([]);
    prisma.vehicle.count.mockResolvedValue(99);

    const scope = {
      orgId: ORG,
      mode: STATION_SCOPE_MODE.NO_STATIONS,
      allowedStationIds: [],
      bypassScope: false,
    };

    const rows = await stationsService.findAll(ORG, undefined, scope);
    const stats = await stationsService.getStationStats(ORG, scope);

    expect(rows).toEqual([]);
    expect(stats.totalStations).toBe(0);
    expect(stats.unassignedVehicles).toBe(0);
    expect(prisma.vehicle.count).not.toHaveBeenCalled();
    expect(prisma.station.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, id: { in: [] } },
      }),
    );
  });

  it('treats missing scope as empty access (not org-wide)', async () => {
    prisma.station.findMany.mockResolvedValue([]);

    await stationsService.findAll(ORG);

    expect(prisma.station.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, id: { in: [] } },
      }),
    );
  });
});
