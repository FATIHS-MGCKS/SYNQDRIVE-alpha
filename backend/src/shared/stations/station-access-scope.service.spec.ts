import { StationAccessScopeService } from './station-access-scope.service';
import { StationScopeService } from './station-scope.service';
import { STATION_SCOPE_MODE } from './station-scope.constants';

const ORG = 'org-1';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('StationAccessScopeService', () => {
  const prisma = {
    station: { findMany: jest.fn() },
  };

  const stationScopeService = new StationScopeService({} as never);
  let service: StationAccessScopeService;

  beforeEach(() => {
    service = new StationAccessScopeService(prisma as never, stationScopeService);
    jest.clearAllMocks();
  });

  it('delegates scope resolution from context', () => {
    const access = service.resolveFromScopeContext({
      orgId: ORG,
      mode: STATION_SCOPE_MODE.ASSIGNED_STATIONS,
      allowedStationIds: [STATION_A],
      bypassScope: false,
    });

    expect(access.readableStationIds).toEqual([STATION_A]);
  });

  it('loads explicit readable station ids for ALL_STATIONS', async () => {
    prisma.station.findMany.mockResolvedValue([{ id: STATION_A }, { id: 's2' }]);

    const access = service.resolveFromScopeContext({
      orgId: ORG,
      mode: STATION_SCOPE_MODE.ALL_STATIONS,
      allowedStationIds: null,
      bypassScope: true,
    });

    const ids = await service.loadReadableStationIds(access);

    expect(ids).toEqual([STATION_A, 's2']);
    expect(prisma.station.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORG },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
  });

  it('returns empty ids without DB lookup when scope is empty', async () => {
    const access = service.emptyScope(ORG);
    const ids = await service.loadReadableStationIds(access);
    expect(ids).toEqual([]);
    expect(prisma.station.findMany).not.toHaveBeenCalled();
  });

  it('resolves from membership via StationScopeService', () => {
    const access = service.resolveFromMembership(ORG, {
      role: 'WORKER',
      stationScope: STATION_A,
      stationIds: [STATION_A],
      permissions: { stationsV2: { read: true } },
    });

    expect(access.mode).toBe(STATION_SCOPE_MODE.ASSIGNED_STATIONS);
    expect(access.readableStationIds).toEqual([STATION_A]);
  });
});
