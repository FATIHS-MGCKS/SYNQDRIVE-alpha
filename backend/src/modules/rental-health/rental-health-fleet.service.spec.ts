import { RentalHealthFleetService } from './rental-health-fleet.service';
import { STATION_ACCESS_BYPASS } from '@shared/stations/station-access.types';

function makePrisma() {
  return {
    vehicle: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

describe('RentalHealthFleetService', () => {
  const rentalHealthSummary = {
    getFleetRowsBatch: jest.fn(),
  };
  const stationAccess = {
    resolve: jest.fn(),
    buildVehicleStationScopeWhere: jest.fn(),
    assertStationReadable: jest.fn(),
  };

  let prisma: ReturnType<typeof makePrisma>;
  let svc: RentalHealthFleetService;

  beforeEach(() => {
    prisma = makePrisma();
    jest.clearAllMocks();
    stationAccess.resolve.mockResolvedValue(STATION_ACCESS_BYPASS);
    stationAccess.buildVehicleStationScopeWhere.mockReturnValue({});
    svc = new RentalHealthFleetService(prisma as any, rentalHealthSummary as any, stationAccess as any);
  });

  it('returns paginated fleet health with availability summary and page detail only', async () => {
    prisma.vehicle.count.mockResolvedValue(3);
    prisma.vehicle.groupBy.mockResolvedValue([
      { status: 'AVAILABLE', _count: { _all: 2 } },
      { status: 'RENTED', _count: { _all: 1 } },
    ]);
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'v1', licensePlate: 'A-1' },
      { id: 'v2', licensePlate: 'B-2' },
      { id: 'v3', licensePlate: 'C-3' },
    ]);
    rentalHealthSummary.getFleetRowsBatch.mockResolvedValue([
      {
        vehicle_id: 'v1',
        organization_id: 'org1',
        overall_state: 'good',
        availability: 'ready',
        rental_blocked: false,
        blocking_reasons: [],
        modules: {},
        generated_at: '2026-07-01T00:00:00.000Z',
      },
      {
        vehicle_id: 'v2',
        organization_id: 'org1',
        overall_state: 'critical',
        availability: 'ready',
        rental_blocked: true,
        blocking_reasons: ['Brakes'],
        modules: {},
        generated_at: '2026-07-01T00:00:00.000Z',
      },
    ]);

    const result = await svc.listFleetHealthPage('org1', 'user-1', { limit: 2 });

    expect(result.summary.availability).toMatchObject({
      totalSelected: 3,
      byVehicleStatus: { AVAILABLE: 2, RENTED: 1 },
      semantics: 'vehicle_status_operational_vs_rental_health_per_row',
    });
    expect(result.data).toHaveLength(2);
    expect(result.summary.pageHealth).toMatchObject({
      rentalBlocked: 1,
      vehiclesWithDetail: 2,
      byOverallState: { good: 1, critical: 1 },
    });
    expect(result.meta.nextCursor).toEqual(expect.any(String));
    expect(stationAccess.resolve).toHaveBeenCalledWith('user-1', 'org1');
  });

  it('applies station scope and explicit station filter to vehicle selection', () => {
    stationAccess.buildVehicleStationScopeWhere.mockReturnValue({
      OR: [{ homeStationId: { in: ['s1'] } }, { currentStationId: { in: ['s1'] } }],
    });

    const where = svc.buildVehicleSelectionWhere('org1', STATION_ACCESS_BYPASS, {
      stationId: 's1',
      search: 'bmw',
      vehicleStatus: 'AVAILABLE',
    });

    expect(stationAccess.assertStationReadable).toHaveBeenCalledWith(STATION_ACCESS_BYPASS, 's1');
    expect(where).toEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([
          { organizationId: 'org1' },
          {
            OR: [{ homeStationId: 's1' }, { currentStationId: 's1' }],
          },
          { status: 'AVAILABLE' },
          {
            OR: expect.arrayContaining([
              { licensePlate: { contains: 'bmw', mode: 'insensitive' } },
            ]),
          },
        ]),
      }),
    );
  });

  describe('getFleetReadinessSummary', () => {
    function healthRow(
      vehicleId: string,
      rentalReadiness?: 'ready' | 'not_ready' | 'unevaluable',
    ) {
      return {
        vehicle_id: vehicleId,
        organization_id: 'org1',
        overall_state: 'good',
        availability: 'ready',
        rental_blocked: rentalReadiness === 'not_ready',
        rental_readiness: rentalReadiness,
        blocking_reasons: [],
        modules: {},
        generated_at: '2026-07-01T00:00:00.000Z',
      };
    }

    it('counts ready, notReady, unevaluable, unknown with invariant', async () => {
      prisma.vehicle.findMany.mockResolvedValueOnce([
        { id: 'v1', licensePlate: 'A' },
        { id: 'v2', licensePlate: 'B' },
        { id: 'v3', licensePlate: 'C' },
        { id: 'v4', licensePlate: 'D' },
        { id: 'v5', licensePlate: 'E' },
      ]);
      rentalHealthSummary.getFleetRowsBatch.mockResolvedValueOnce([
        healthRow('v1', 'ready'),
        healthRow('v2', 'ready'),
        healthRow('v3', 'not_ready'),
        healthRow('v4', 'unevaluable'),
        healthRow('v5', undefined),
      ]);

      const result = await svc.getFleetReadinessSummary('org1', 'user-1', {});

      expect(result).toEqual({
        total: 5,
        ready: 2,
        notReady: 1,
        unevaluable: 1,
        unknown: 1,
        readyPercent: 40,
      });
      expect(result.total).toBe(result.ready + result.notReady + result.unevaluable + result.unknown);
    });

    it('missing rental_readiness never counts as ready', async () => {
      prisma.vehicle.findMany.mockResolvedValueOnce([{ id: 'v1', licensePlate: 'A' }]);
      rentalHealthSummary.getFleetRowsBatch.mockResolvedValueOnce([healthRow('v1', undefined)]);

      const result = await svc.getFleetReadinessSummary('org1', 'user-1', {});

      expect(result.ready).toBe(0);
      expect(result.unknown).toBe(1);
    });

    it('paginates beyond 200 vehicles for full-fleet summary', async () => {
      const page1 = Array.from({ length: 200 }, (_, i) => ({
        id: `v${i}`,
        licensePlate: `P${i}`,
      }));
      const page2 = [{ id: 'v200', licensePlate: 'P200' }];

      prisma.vehicle.findMany
        .mockResolvedValueOnce([...page1, page2[0]])
        .mockResolvedValueOnce(page2);

      rentalHealthSummary.getFleetRowsBatch
        .mockResolvedValueOnce(page1.map((v) => healthRow(v.id, 'ready')))
        .mockResolvedValueOnce([healthRow('v200', 'not_ready')]);

      const result = await svc.getFleetReadinessSummary('org1', 'user-1', {});

      expect(result.total).toBe(201);
      expect(result.ready).toBe(200);
      expect(result.notReady).toBe(1);
      expect(prisma.vehicle.findMany).toHaveBeenCalledTimes(2);
    });

    it('applies station scope from station access', async () => {
      stationAccess.resolve.mockResolvedValue({
        stationIds: ['s1'],
        bypass: false,
      });
      stationAccess.buildVehicleStationScopeWhere.mockReturnValue({
        OR: [{ homeStationId: { in: ['s1'] } }],
      });
      prisma.vehicle.findMany.mockResolvedValueOnce([]);

      await svc.getFleetReadinessSummary('org1', 'worker-1', { stationId: 's1' });

      expect(stationAccess.resolve).toHaveBeenCalledWith('worker-1', 'org1');
      expect(stationAccess.assertStationReadable).toHaveBeenCalled();
    });

    it('respects search and vehicleStatus filters', async () => {
      prisma.vehicle.findMany.mockResolvedValueOnce([]);
      await svc.getFleetReadinessSummary('org1', 'user-1', {
        search: 'bmw',
        vehicleStatus: 'AVAILABLE',
      });

      const whereArg = prisma.vehicle.findMany.mock.calls[0][0].where;
      expect(whereArg).toEqual(
        expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ organizationId: 'org1' }),
            { status: 'AVAILABLE' },
            expect.objectContaining({
              OR: expect.arrayContaining([
                { licensePlate: { contains: 'bmw', mode: 'insensitive' } },
              ]),
            }),
          ]),
        }),
      );
    });

    it('scopes summary to organization vehicles only', async () => {
      prisma.vehicle.findMany.mockResolvedValueOnce([{ id: 'v1', licensePlate: 'A' }]);
      rentalHealthSummary.getFleetRowsBatch.mockResolvedValueOnce([
        healthRow('v1', 'ready'),
      ]);

      await svc.getFleetReadinessSummary('org-a', 'user-1', {});

      expect(prisma.vehicle.findMany.mock.calls[0][0].where).toEqual(
        expect.objectContaining({
          AND: expect.arrayContaining([{ organizationId: 'org-a' }]),
        }),
      );
      expect(rentalHealthSummary.getFleetRowsBatch).toHaveBeenCalledWith('org-a', ['v1']);
    });

    it('empty fleet returns zeros', async () => {
      prisma.vehicle.findMany.mockResolvedValueOnce([]);

      const result = await svc.getFleetReadinessSummary('org1', 'user-1', {});

      expect(result).toEqual({
        total: 0,
        ready: 0,
        notReady: 0,
        unevaluable: 0,
        unknown: 0,
        readyPercent: 0,
      });
    });
  });
});
