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
        rental_blocked: false,
        blocking_reasons: [],
        modules: {},
        generated_at: '2026-07-01T00:00:00.000Z',
      },
      {
        vehicle_id: 'v2',
        organization_id: 'org1',
        overall_state: 'critical',
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
});
