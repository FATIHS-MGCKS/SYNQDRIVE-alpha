import { VehiclesService } from './vehicles.service';
import { FLEET_CONNECTIVITY_HARD_LIMIT } from './fleet-connectivity.util';

function makeFleetConnectivityService(prisma: {
  vehicle: { findMany: jest.Mock };
}): VehiclesService {
  const stub = (): unknown => ({});
  return new (VehiclesService as unknown as {
    new (...args: unknown[]): VehiclesService;
  })(
    prisma,
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
  );
}

describe('VehiclesService.getFleetConnectivity', () => {
  const orgA = 'org-tenant-a';
  const orgB = 'org-tenant-b';

  const vehicleRow = {
    id: 'v-1',
    vin: 'WVWZZZ1JZXW000001',
    licensePlate: 'B-XY 1',
    make: 'VW',
    model: 'Golf',
    year: 2022,
    organizationId: orgA,
    dimoVehicle: {
      tokenId: 12345678,
      lastSignal: new Date('2026-06-17T11:55:00.000Z'),
      syncedAt: new Date('2026-06-17T11:55:00.000Z'),
      createdAt: new Date('2026-01-01'),
      rawJson: {},
    },
    latestState: {
      lastSeenAt: new Date('2026-06-17T11:55:00.000Z'),
      latitude: 52.5,
      longitude: 13.4,
      speedKmh: 30,
      odometerKm: 1000,
      fuelLevelRelative: 0.5,
      fuelLevelAbsolute: null,
      evSoc: null,
      obdDtcList: null,
      lastDtcPollAt: null,
      rawPayloadJson: { obdIsPluggedIn: { value: true } },
      providerSource: 'DIMO',
    },
    homeStation: { name: 'Berlin' },
  };

  let findMany: jest.Mock;

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([vehicleRow]);
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-17T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('scopes prisma query to organizationId (tenant isolation)', async () => {
    const service = makeFleetConnectivityService({ vehicle: { findMany } });
    await service.getFleetConnectivity(orgA, {});

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: orgA },
        take: FLEET_CONNECTIVITY_HARD_LIMIT,
      }),
    );
  });

  it('returns read-only response contract with thresholds and generatedAt', async () => {
    const service = makeFleetConnectivityService({ vehicle: { findMany } });
    const res = await service.getFleetConnectivity(orgA, {});

    expect(res.generatedAt).toBe('2026-06-17T12:00:00.000Z');
    expect(res.thresholds).toEqual({
      onlineMaxMinutes: 15,
      standbyMaxHours: 24,
    });
    expect(res.summary.total).toBe(1);
    expect(res.summary.online).toBe(1);
    expect(res.vehicles).toHaveLength(1);
    expect(res.vehicles[0].vehicleId).toBe('v-1');
    expect(res.vehicles[0].maskedDimoTokenId).toBe('123…678');
    expect(res.vehicles[0].dimoTokenId).toBeNull();
    expect(res.pagination.totalInOrganization).toBe(1);
  });

  it('builds summary on filtered set, not only current page', async () => {
    const offlineVehicle = {
      ...vehicleRow,
      id: 'v-2',
      vin: 'OFFLINE-VIN',
      dimoVehicle: {
        ...vehicleRow.dimoVehicle,
        lastSignal: new Date('2026-06-10T12:00:00.000Z'),
      },
      latestState: {
        ...vehicleRow.latestState,
        lastSeenAt: new Date('2026-06-10T12:00:00.000Z'),
      },
    };
    findMany.mockResolvedValue([vehicleRow, offlineVehicle]);

    const service = makeFleetConnectivityService({ vehicle: { findMany } });
    const res = await service.getFleetConnectivity(orgA, {
      status: 'online',
      page: 1,
      limit: 1,
    });

    expect(res.summary.total).toBe(1);
    expect(res.summary.online).toBe(1);
    expect(res.summary.offline).toBe(0);
    expect(res.vehicles).toHaveLength(1);
    expect(res.pagination.total).toBe(1);
  });

  it('does not return vehicles from another org (query isolation)', async () => {
    findMany.mockImplementation(async (args: { where: { organizationId: string } }) => {
      if (args.where.organizationId === orgB) return [];
      return [vehicleRow];
    });

    const service = makeFleetConnectivityService({ vehicle: { findMany } });
    const res = await service.getFleetConnectivity(orgB, {});
    expect(res.vehicles).toHaveLength(0);
    expect(res.summary.total).toBe(0);
  });
});
