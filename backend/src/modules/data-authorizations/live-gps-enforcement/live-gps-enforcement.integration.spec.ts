import { AuthorizationDecisionCache } from '../authorization-decision-engine/authorization-decision.cache';
import { fleetMapCacheKey } from './live-gps-enforcement.constants';

describe('live-gps enforcement integration', () => {
  describe('AuthorizationDecisionCache org invalidation', () => {
    it('drops only entries for the revoked organization', () => {
      const cache = new AuthorizationDecisionCache(30_000, 100);
      cache.set(
        'org-a|GPS_LOCATION|LIVE_MAP|veh-1',
        'policy-v1',
        { decision: 'ALLOW', correlationId: 'c1' } as never,
      );
      cache.set(
        'org-b|GPS_LOCATION|LIVE_MAP|veh-2',
        'policy-v1',
        { decision: 'ALLOW', correlationId: 'c2' } as never,
      );

      expect(cache.invalidateOrganization('org-a')).toBe(1);
      expect(cache.get('org-a|GPS_LOCATION|LIVE_MAP|veh-1')).toBeNull();
      expect(cache.get('org-b|GPS_LOCATION|LIVE_MAP|veh-2')?.decision).toBe('ALLOW');
    });
  });

  describe('fleet-map cache key contract', () => {
    it('matches FleetMapCacheService key shape', () => {
      expect(fleetMapCacheKey('org-xyz')).toBe('fleet-map:org-xyz:v1');
    });
  });
});
