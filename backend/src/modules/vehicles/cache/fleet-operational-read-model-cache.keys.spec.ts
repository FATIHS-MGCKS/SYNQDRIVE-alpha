import {
  fleetMapCacheKey,
  fleetOperationalCacheKeysForVehicles,
  vehicleOperationalCacheKey,
} from './fleet-operational-read-model-cache.keys';

describe('fleet-operational-read-model-cache.keys', () => {
  it('builds fleet-map key per organization', () => {
    expect(fleetMapCacheKey('org-1')).toBe('fleet-map:org-1:v1');
  });

  it('builds vehicle operational key per org and vehicle', () => {
    expect(vehicleOperationalCacheKey('org-1', 'veh-1')).toBe(
      'vehicle-operational:org-1:veh-1:v1',
    );
  });

  it('deduplicates vehicle ids and always includes fleet-map key', () => {
    expect(
      fleetOperationalCacheKeysForVehicles('org-1', ['veh-1', 'veh-1', 'veh-2']),
    ).toEqual([
      'fleet-map:org-1:v1',
      'vehicle-operational:org-1:veh-1:v1',
      'vehicle-operational:org-1:veh-2:v1',
    ]);
  });
});
