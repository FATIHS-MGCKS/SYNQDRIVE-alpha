import { VehicleStatus } from '@prisma/client';
import { DataAuthorizationDeniedException } from '@modules/data-authorizations/data-authorization.exceptions';
import {
  makeGpsPositionAccessStub,
  makeOperationalPrismaMocks,
  makeOperationalVehiclesService,
  makeVehicleRow,
} from './vehicle-operational-state-v2.test-helpers';

describe('Vehicle Operational State V2 — fleet-map cache', () => {
  const orgId = 'org-cache-test';
  const cachedPayload = [{ id: 'veh-cached', status: 'Available' }];

  it('serves fleet-map from redis cache on hit (read-through)', async () => {
    const redisGet = jest.fn().mockResolvedValue(JSON.stringify(cachedPayload));
    const vehicleFindMany = jest.fn();
    const gpsPositionAccess = makeGpsPositionAccessStub();
    const service = makeOperationalVehiclesService({
      prisma: { vehicle: { findMany: vehicleFindMany } },
      redis: { get: redisGet, set: jest.fn() },
      gpsPositionAccess,
    });

    const result = await service.getFleetMapData(orgId);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('veh-cached');
    expect(result[0].cachedAt).toEqual(expect.any(String));
    expect(gpsPositionAccess.assertOrgFleetGpsAccess).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: orgId, purpose: 'FLEET_ANALYTICS' }),
    );
    expect(redisGet).toHaveBeenCalledWith(`fleet-map:${orgId}:v1`);
    expect(vehicleFindMany).not.toHaveBeenCalled();
  });

  it('denies fleet-map cache hit when org GPS authorization fails', async () => {
    const redisGet = jest.fn().mockResolvedValue(JSON.stringify(cachedPayload));
    const gpsPositionAccess = makeGpsPositionAccessStub();
    gpsPositionAccess.assertOrgFleetGpsAccess.mockRejectedValue(
      new DataAuthorizationDeniedException('denied'),
    );
    const service = makeOperationalVehiclesService({
      prisma: { vehicle: { findMany: jest.fn() } },
      redis: { get: redisGet, set: jest.fn() },
      gpsPositionAccess,
    });

    await expect(service.getFleetMapData(orgId)).rejects.toBeInstanceOf(
      DataAuthorizationDeniedException,
    );
    expect(redisGet).not.toHaveBeenCalled();
  });

  it('writes fleet-map payload to redis with 5s TTL on miss', async () => {
    const vehicle = makeVehicleRow();
    const redisGet = jest.fn().mockResolvedValue(null);
    const redisSet = jest.fn().mockResolvedValue('OK');
    const service = makeOperationalVehiclesService({
      prisma: makeOperationalPrismaMocks({
        vehicle: { findMany: jest.fn().mockResolvedValue([vehicle]) },
        booking: { findMany: jest.fn().mockResolvedValue([]) },
      }),
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
      prisma: makeOperationalPrismaMocks({
        vehicle: { findMany: jest.fn().mockResolvedValue([]) },
        booking: { findMany: jest.fn().mockResolvedValue([]) },
      }),
      redis: { get: redisGet, set: jest.fn() },
    });

    await service.getFleetMapData('org-a');
    await service.getFleetMapData('org-b');
    expect(redisGet.mock.calls.map((c) => c[0])).toEqual([
      'fleet-map:org-a:v1',
      'fleet-map:org-b:v1',
    ]);
  });

  it('invalidateFleetMapCache deletes org-scoped redis key', async () => {
    const redisDel = jest.fn().mockResolvedValue(1);
    const service = makeOperationalVehiclesService({
      redis: { get: jest.fn(), set: jest.fn(), del: redisDel },
    });

    await service.invalidateFleetMapCache(orgId);
    expect(redisDel).toHaveBeenCalledWith(`fleet-map:${orgId}:v1`);
  });
});
