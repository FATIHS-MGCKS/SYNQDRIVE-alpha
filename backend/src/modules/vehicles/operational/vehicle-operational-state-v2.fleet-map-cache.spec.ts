import { VehicleStatus } from '@prisma/client';
import {
  makeOperationalVehiclesService,
  makeVehicleRow,
} from './vehicle-operational-state-v2.test-helpers';

describe('Vehicle Operational State V2 — fleet-map cache', () => {
  const orgId = 'org-cache-test';
  const cachedPayload = [{ id: 'veh-cached', status: 'Available' }];

  it('serves fleet-map from redis cache on hit (read-through)', async () => {
    const redisGet = jest.fn().mockResolvedValue(JSON.stringify(cachedPayload));
    const vehicleFindMany = jest.fn();
    const service = makeOperationalVehiclesService({
      prisma: { vehicle: { findMany: vehicleFindMany } },
      redis: { get: redisGet, set: jest.fn() },
    });

    const result = await service.getFleetMapData(orgId);
    expect(result).toEqual(cachedPayload);
    expect(redisGet).toHaveBeenCalledWith(`fleet-map:${orgId}:v1`);
    expect(vehicleFindMany).not.toHaveBeenCalled();
  });

  it('writes fleet-map payload to redis with 5s TTL on miss', async () => {
    const vehicle = makeVehicleRow();
    const redisGet = jest.fn().mockResolvedValue(null);
    const redisSet = jest.fn().mockResolvedValue('OK');
    const service = makeOperationalVehiclesService({
      prisma: {
        vehicle: { findMany: jest.fn().mockResolvedValue([vehicle]) },
        vehicleTripDetectionState: { findMany: jest.fn().mockResolvedValue([]) },
        booking: { findMany: jest.fn().mockResolvedValue([]) },
        station: { findMany: jest.fn().mockResolvedValue([]) },
        bookingHandoverProtocol: { findMany: jest.fn().mockResolvedValue([]) },
      },
      redis: { get: redisGet, set: redisSet },
    });

    await service.getFleetMapData(orgId);
    expect(redisSet).toHaveBeenCalledWith(
      `fleet-map:${orgId}:v1`,
      expect.any(String),
      'EX',
      5,
    );
  });

  it('uses org-scoped cache keys (tenant isolation)', async () => {
    const redisGet = jest.fn().mockResolvedValue(null);
    const service = makeOperationalVehiclesService({
      prisma: {
        vehicle: { findMany: jest.fn().mockResolvedValue([]) },
        vehicleTripDetectionState: { findMany: jest.fn().mockResolvedValue([]) },
        booking: { findMany: jest.fn().mockResolvedValue([]) },
        station: { findMany: jest.fn().mockResolvedValue([]) },
        bookingHandoverProtocol: { findMany: jest.fn().mockResolvedValue([]) },
      },
      redis: { get: redisGet, set: jest.fn() },
    });

    await service.getFleetMapData('org-a');
    await service.getFleetMapData('org-b');
    expect(redisGet.mock.calls.map((c) => c[0])).toEqual([
      'fleet-map:org-a:v1',
      'fleet-map:org-b:v1',
    ]);
  });

  it('documents TTL-only invalidation — mutations do not bust cache yet', async () => {
    const service = makeOperationalVehiclesService({
      prisma: {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({ id: 'veh-1', organizationId: orgId }),
          findUniqueOrThrow: jest.fn(),
          update: jest.fn().mockResolvedValue({ id: 'veh-1', status: VehicleStatus.IN_SERVICE }),
        },
      },
      redis: { get: jest.fn(), set: jest.fn() },
    });

    await service.update('veh-1', { status: VehicleStatus.IN_SERVICE }, orgId);
    expect((service as any).redis.del).toBeUndefined();
  });
});
