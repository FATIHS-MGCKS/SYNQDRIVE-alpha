import { RentalHealthSummaryCacheService } from './rental-health-summary-cache.service';
import {
  RENTAL_HEALTH_SUMMARY_CACHE_KEY_VERSION,
  RENTAL_HEALTH_SUMMARY_CACHE_TTL_SECONDS,
} from './rental-health-summary.types';
import type { VehicleHealth } from './rental-health.types';

describe('RentalHealthSummaryCacheService', () => {
  const orgId = 'org-cache';
  const vehicleId = 'veh-cache';
  const health: VehicleHealth = {
    vehicle_id: vehicleId,
    organization_id: orgId,
    overall_state: 'good',
    rental_blocked: false,
    blocking_reasons: [],
    modules: {} as VehicleHealth['modules'],
    generated_at: '2026-07-01T00:00:00.000Z',
  };

  it('uses tenant-safe org+vehicle cache keys', () => {
    const redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    const svc = new RentalHealthSummaryCacheService(redis as never);

    expect(svc.cacheKey('org-a', 'veh-1')).toBe(
      `rental-health-summary:org-a:veh-1:${RENTAL_HEALTH_SUMMARY_CACHE_KEY_VERSION}`,
    );
    expect(svc.cacheKey('org-b', 'veh-1')).not.toBe(svc.cacheKey('org-a', 'veh-1'));
  });

  it('writes envelope with configured TTL on set', async () => {
    const redisSet = jest.fn().mockResolvedValue('OK');
    const svc = new RentalHealthSummaryCacheService({ set: redisSet } as never);

    await svc.set(orgId, vehicleId, health);

    expect(redisSet).toHaveBeenCalledWith(
      `rental-health-summary:${orgId}:${vehicleId}:${RENTAL_HEALTH_SUMMARY_CACHE_KEY_VERSION}`,
      expect.stringContaining('"cached_at"'),
      'EX',
      RENTAL_HEALTH_SUMMARY_CACHE_TTL_SECONDS,
    );
  });

  it('returns parsed envelope on cache hit', async () => {
    const envelope = { health, cached_at: '2026-07-01T00:00:00.000Z' };
    const redisGet = jest.fn().mockResolvedValue(JSON.stringify(envelope));
    const svc = new RentalHealthSummaryCacheService({ get: redisGet } as never);

    await expect(svc.get(orgId, vehicleId)).resolves.toEqual(envelope);
  });

  it('invalidates org+vehicle scoped key', async () => {
    const redisDel = jest.fn().mockResolvedValue(1);
    const svc = new RentalHealthSummaryCacheService({ del: redisDel } as never);

    await svc.invalidate(orgId, vehicleId);
    expect(redisDel).toHaveBeenCalledWith(
      `rental-health-summary:${orgId}:${vehicleId}:${RENTAL_HEALTH_SUMMARY_CACHE_KEY_VERSION}`,
    );
  });
});
