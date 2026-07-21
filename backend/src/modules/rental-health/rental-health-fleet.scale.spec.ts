import { RentalHealthFleetService } from './rental-health-fleet.service';
import { RentalHealthSummaryService } from './rental-health-summary.service';
import { STATION_ACCESS_BYPASS } from '@shared/stations/station-access.types';
import { FLEET_RENTAL_HEALTH_MAX_LIMIT } from './rental-health-fleet-cursor.util';

function makePrisma() {
  return {
    vehicle: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

function vehicleRow(index: number) {
  return { id: `veh-${String(index).padStart(5, '0')}`, licensePlate: `M-${index}` };
}

describe('RentalHealthFleetService scale coverage', () => {
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

  it.each([100, 500, 1000, 5000])(
    'uses three prisma reads per fleet page regardless of fleet size (%i selected)',
    async (totalSelected) => {
      const pageLimit = FLEET_RENTAL_HEALTH_MAX_LIMIT;
      const pageRows = Array.from({ length: pageLimit }, (_, i) => vehicleRow(i));

      prisma.vehicle.count.mockResolvedValue(totalSelected);
      prisma.vehicle.groupBy.mockResolvedValue([{ status: 'AVAILABLE', _count: { _all: totalSelected } }]);
      prisma.vehicle.findMany.mockResolvedValue(pageRows);
      rentalHealthSummary.getFleetRowsBatch.mockResolvedValue(
        pageRows.map((row) => ({
          vehicle_id: row.id,
          organization_id: 'org-scale',
          overall_state: 'good',
          availability: 'ready',
          rental_blocked: false,
          blocking_reasons: [],
          modules: {},
          generated_at: '2026-07-01T00:00:00.000Z',
        })),
      );

      await svc.listFleetHealthPage('org-scale', 'user-1', { limit: pageLimit });

      expect(prisma.vehicle.count).toHaveBeenCalledTimes(1);
      expect(prisma.vehicle.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.vehicle.findMany).toHaveBeenCalledTimes(1);
      expect(rentalHealthSummary.getFleetRowsBatch).toHaveBeenCalledTimes(1);
      expect(rentalHealthSummary.getFleetRowsBatch.mock.calls[0]![1]).toHaveLength(pageLimit);
    },
  );

  it('paginates large fleets with bounded page size', async () => {
    const total = 500;
    const limit = 50;
    prisma.vehicle.count.mockResolvedValue(total);
    prisma.vehicle.groupBy.mockResolvedValue([{ status: 'AVAILABLE', _count: { _all: total } }]);
    prisma.vehicle.findMany
      .mockResolvedValueOnce(Array.from({ length: limit + 1 }, (_, i) => vehicleRow(i)))
      .mockResolvedValueOnce(Array.from({ length: limit }, (_, i) => vehicleRow(i + limit)));

    rentalHealthSummary.getFleetRowsBatch.mockImplementation(async (_orgId, ids: string[]) =>
      ids.map((id) => ({
        vehicle_id: id,
        organization_id: 'org-scale',
        overall_state: 'good',
        availability: 'ready',
        rental_blocked: false,
        blocking_reasons: [],
        modules: {},
        generated_at: '2026-07-01T00:00:00.000Z',
      })),
    );

    const first = await svc.listFleetHealthPage('org-scale', 'user-1', { limit });
    expect(first.meta.nextCursor).toEqual(expect.any(String));
    expect(first.data).toHaveLength(limit);

    await svc.listFleetHealthPage('org-scale', 'user-1', {
      limit,
      cursor: first.meta.nextCursor!,
    });
    expect(prisma.vehicle.findMany).toHaveBeenCalledTimes(2);
  });
});
