import { FleetOperationalReadModelCacheService } from './fleet-operational-read-model-cache.service';
import { RedisService } from '@shared/redis/redis.service';
import {
  fleetMapCacheKey,
  vehicleOperationalCacheKey,
} from './fleet-operational-read-model-cache.keys';

describe('FleetOperationalReadModelCacheService', () => {
  let redis: { del: jest.Mock };
  let service: FleetOperationalReadModelCacheService;

  beforeEach(() => {
    redis = { del: jest.fn().mockResolvedValue(1) };
    service = new FleetOperationalReadModelCacheService(
      redis as unknown as RedisService,
    );
  });

  it('deletes fleet-map and per-vehicle keys', async () => {
    await service.invalidateVehicles({
      organizationId: 'org-1',
      vehicleIds: ['veh-1'],
    });

    expect(redis.del).toHaveBeenCalledWith(
      fleetMapCacheKey('org-1'),
      vehicleOperationalCacheKey('org-1', 'veh-1'),
    );
  });

  it('invalidates both vehicles on reassignment', async () => {
    await service.invalidateVehicles({
      organizationId: 'org-1',
      vehicleIds: ['veh-old', 'veh-new'],
    });

    expect(redis.del).toHaveBeenCalledWith(
      fleetMapCacheKey('org-1'),
      vehicleOperationalCacheKey('org-1', 'veh-old'),
      vehicleOperationalCacheKey('org-1', 'veh-new'),
    );
  });

  it('swallows redis errors without throwing', async () => {
    redis.del.mockRejectedValue(new Error('redis down'));
    await expect(
      service.invalidateVehicles({
        organizationId: 'org-1',
        vehicleIds: ['veh-1'],
      }),
    ).resolves.toBeUndefined();
  });
});
