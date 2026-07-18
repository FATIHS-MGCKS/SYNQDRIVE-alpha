import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { VehicleHomeFleetDeltaService } from './vehicle-home-fleet-delta.service';
import {
  VehicleHomeFleetDeltaCommandName,
  VehicleHomeFleetDeltaIssueCode,
  VehicleHomeFleetDeltaItemOutcome,
} from './vehicle-home-fleet-delta.types';

const ORG = 'org-home-fleet-delta';
const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VEHICLE_1 = '11111111-1111-4111-8111-111111111111';
const VEHICLE_2 = '22222222-2222-4222-8222-222222222222';
const VEHICLE_3 = '33333333-3333-4333-8333-333333333333';
const FOREIGN_VEHICLE = '44444444-4444-4444-8444-444444444444';

describe('VehicleHomeFleetDeltaService', () => {
  const vehicles = new Map<string, {
    id: string;
    organizationId: string;
    homeStationId: string | null;
    currentStationId: string | null;
    expectedStationId: string | null;
    stationPositionVersion: number;
    status: string;
  }>();

  const stations = new Map<string, { id: string; organizationId: string; status: string; name: string }>([
    [STATION_A, { id: STATION_A, organizationId: ORG, status: 'ACTIVE', name: 'A' }],
    [STATION_B, { id: STATION_B, organizationId: ORG, status: 'ACTIVE', name: 'B' }],
  ]);

  const prisma = {
    station: {
      findFirst: jest.fn(async ({ where }: { where: { id?: string; organizationId?: string } }) => {
        const station = where.id ? stations.get(where.id) : undefined;
        if (!station) return null;
        if (where.organizationId && station.organizationId !== where.organizationId) return null;
        return station;
      }),
    },
    vehicle: {
      findMany: jest.fn(async ({ where }: { where: { organizationId: string; id?: { in: string[] } } }) => {
        const ids = where.id?.in ?? [];
        return ids
          .map((id) => vehicles.get(id))
          .filter((vehicle): vehicle is NonNullable<typeof vehicle> => {
            return !!vehicle && vehicle.organizationId === where.organizationId;
          })
          .map((vehicle) => ({
            id: vehicle.id,
            homeStationId: vehicle.homeStationId,
            currentStationId: vehicle.currentStationId,
            expectedStationId: vehicle.expectedStationId,
            stationPositionVersion: vehicle.stationPositionVersion,
            status: vehicle.status,
          }));
      }),
      findFirst: jest.fn(async ({ where }: { where: { id: string; organizationId: string } }) => {
        const vehicle = vehicles.get(where.id);
        if (!vehicle || vehicle.organizationId !== where.organizationId) return null;
        return {
          id: vehicle.id,
          homeStationId: vehicle.homeStationId,
          currentStationId: vehicle.currentStationId,
          expectedStationId: vehicle.expectedStationId,
          stationPositionVersion: vehicle.stationPositionVersion,
          status: vehicle.status,
        };
      }),
      updateMany: jest.fn(async ({ where, data }: {
        where: { id: string; organizationId: string; stationPositionVersion: number };
        data: { homeStationId: string | null; stationPositionVersion: { increment: number } };
      }) => {
        const vehicle = vehicles.get(where.id);
        if (
          !vehicle ||
          vehicle.organizationId !== where.organizationId ||
          vehicle.stationPositionVersion !== where.stationPositionVersion
        ) {
          return { count: 0 };
        }
        vehicle.homeStationId = data.homeStationId;
        vehicle.stationPositionVersion += data.stationPositionVersion.increment;
        return { count: 1 };
      }),
    },
  } as unknown as PrismaService;

  const service = new VehicleHomeFleetDeltaService(prisma);

  beforeEach(() => {
    vehicles.clear();
    vehicles.set(VEHICLE_1, {
      id: VEHICLE_1,
      organizationId: ORG,
      homeStationId: null,
      currentStationId: 'current-1',
      expectedStationId: 'expected-1',
      stationPositionVersion: 0,
      status: 'AVAILABLE',
    });
    vehicles.set(VEHICLE_2, {
      id: VEHICLE_2,
      organizationId: ORG,
      homeStationId: STATION_A,
      currentStationId: 'current-2',
      expectedStationId: 'expected-2',
      stationPositionVersion: 1,
      status: 'RENTED',
    });
    vehicles.set(VEHICLE_3, {
      id: VEHICLE_3,
      organizationId: ORG,
      homeStationId: STATION_A,
      currentStationId: 'current-3',
      expectedStationId: 'expected-3',
      stationPositionVersion: 2,
      status: 'AVAILABLE',
    });
    jest.clearAllMocks();
  });

  it('adds only listed vehicles without touching current/expected', async () => {
    const result = await service.addVehiclesToHomeStation(ORG, STATION_A, [VEHICLE_1], {
      idempotencyKey: 'batch-add-1',
    });

    expect(result.command).toBe(VehicleHomeFleetDeltaCommandName.ADD);
    expect(result.summary).toEqual({ requested: 1, applied: 1, idempotent: 0, failed: 0 });
    expect(vehicles.get(VEHICLE_1)?.homeStationId).toBe(STATION_A);
    expect(vehicles.get(VEHICLE_1)?.currentStationId).toBe('current-1');
    expect(vehicles.get(VEHICLE_1)?.expectedStationId).toBe('expected-1');
    expect(result.results[0]?.idempotencyKey).toBe(`batch-add-1:${VEHICLE_1}`);
  });

  it('returns per-vehicle failures for cross-tenant vehicles in batch add', async () => {
    const result = await service.addVehiclesToHomeStation(
      ORG,
      STATION_A,
      [VEHICLE_1, FOREIGN_VEHICLE],
    );

    expect(result.summary).toEqual({ requested: 2, applied: 1, idempotent: 0, failed: 1 });
    expect(result.results.find((r) => r.vehicleId === FOREIGN_VEHICLE)?.error?.code).toBe(
      VehicleHomeFleetDeltaIssueCode.VEHICLE_NOT_FOUND,
    );
  });

  it('removes only vehicles currently at the source station home fleet', async () => {
    vehicles.get(VEHICLE_1)!.homeStationId = STATION_B;

    const result = await service.removeVehiclesFromHomeStation(ORG, STATION_A, [
      VEHICLE_2,
      VEHICLE_1,
    ]);

    expect(result.summary).toEqual({ requested: 2, applied: 1, idempotent: 0, failed: 1 });
    expect(vehicles.get(VEHICLE_2)?.homeStationId).toBeNull();
    expect(vehicles.get(VEHICLE_1)?.homeStationId).toBe(STATION_B);
    expect(result.results.find((r) => r.vehicleId === VEHICLE_1)?.outcome).toBe(
      VehicleHomeFleetDeltaItemOutcome.FAILED,
    );
    expect(result.results.find((r) => r.vehicleId === VEHICLE_1)?.error?.code).toBe(
      VehicleHomeFleetDeltaIssueCode.NOT_AT_SOURCE_STATION,
    );
  });

  it('moves listed vehicles to target station without changing current/expected', async () => {
    const result = await service.moveVehiclesToHomeStation(
      ORG,
      STATION_A,
      STATION_B,
      [VEHICLE_3],
    );

    expect(result.summary.applied).toBe(1);
    expect(vehicles.get(VEHICLE_3)?.homeStationId).toBe(STATION_B);
    expect(vehicles.get(VEHICLE_3)?.currentStationId).toBe('current-3');
    expect(vehicles.get(VEHICLE_3)?.expectedStationId).toBe('expected-3');
  });

  it('rejects archived target stations', async () => {
    const archivedId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    stations.set(archivedId, {
      id: archivedId,
      organizationId: ORG,
      status: 'ARCHIVED',
      name: 'Archived',
    });

    await expect(
      service.addVehiclesToHomeStation(ORG, archivedId, [VEHICLE_1]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fails when client expectedVersions do not match current stationPositionVersion', async () => {
    const result = await service.addVehiclesToHomeStation(ORG, STATION_A, [VEHICLE_1], {
      expectedVersions: [{ vehicleId: VEHICLE_1, expectedVersion: 99 }],
    });

    expect(result.summary).toEqual({ requested: 1, applied: 0, idempotent: 0, failed: 1 });
    expect(result.results[0]?.outcome).toBe(VehicleHomeFleetDeltaItemOutcome.FAILED);
    expect(result.results[0]?.error?.code).toBe(
      VehicleHomeFleetDeltaIssueCode.VERSION_CONFLICT,
    );
    expect(vehicles.get(VEHICLE_1)?.homeStationId).toBeNull();
  });

  it('handles parallel updates with per-vehicle version conflicts', async () => {
    const [first, second] = await Promise.all([
      service.addVehiclesToHomeStation(ORG, STATION_A, [VEHICLE_1]),
      service.addVehiclesToHomeStation(ORG, STATION_A, [VEHICLE_1]),
    ]);

    const outcomes = [first.summary, second.summary];
    const appliedCount = outcomes.reduce((sum, summary) => sum + summary.applied, 0);
    const failedCount = outcomes.reduce((sum, summary) => sum + summary.failed, 0);

    expect(appliedCount + failedCount).toBe(2);
    expect(appliedCount).toBeGreaterThanOrEqual(1);
    expect(vehicles.get(VEHICLE_1)?.homeStationId).toBe(STATION_A);
  });

  it('is idempotent when batch add is retried with the same key', async () => {
    await service.addVehiclesToHomeStation(ORG, STATION_A, [VEHICLE_1], {
      idempotencyKey: 'retry-batch',
    });
    const retry = await service.addVehiclesToHomeStation(ORG, STATION_A, [VEHICLE_1], {
      idempotencyKey: 'retry-batch',
    });

    expect(retry.summary).toEqual({ requested: 1, applied: 0, idempotent: 1, failed: 0 });
    expect(retry.results[0]?.idempotencyKey).toBe(`retry-batch:${VEHICLE_1}`);
  });
});
