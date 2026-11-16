import { resolveCoreEntitlementsM2mProductionReady } from './entitlements-query.types';

describe('resolveCoreEntitlementsM2mProductionReady (Alpha P2)', () => {
  it('is always false until M2M P3 is implemented', () => {
    expect(resolveCoreEntitlementsM2mProductionReady()).toBe(false);
  });
});