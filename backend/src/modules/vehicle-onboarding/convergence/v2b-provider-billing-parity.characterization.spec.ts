import { buildQuantityIdempotencyKey } from '@modules/billing/domain/billing-quantity-ledger';
import { buildRegistryActivateBillingIdempotencyKey } from '@modules/billing/registry-lifecycle/validate-vehicle-activated-registry-event';
import { shouldSuppressLegacyVehicleCreateBillingHook } from './vehicle-registration-convergence.routing';

describe('V2B provider billing parity characterization', () => {
  it('single-rail suppress helper is inert post-PR4 (no production create hook)', () => {
    expect(
      shouldSuppressLegacyVehicleCreateBillingHook({
        hmOnlyCanonicalEnabled: true,
        billingSingleRailEnabled: false,
        shadowCompareEnabled: false,
      }),
    ).toBe(false);
    expect(
      shouldSuppressLegacyVehicleCreateBillingHook({
        hmOnlyCanonicalEnabled: false,
        billingSingleRailEnabled: false,
        shadowCompareEnabled: false,
      }),
    ).toBe(false);
  });

  it('documents disjoint idempotency namespaces for legacy hook vs registry activate', () => {
    const legacy = buildQuantityIdempotencyKey(['vehicle', 'connected', 'org', 'veh']);
    const registry = buildRegistryActivateBillingIdempotencyKey('evt-1');
    expect(legacy).not.toEqual(registry);
    expect(registry).toBe('vehicle-registry:evt-1:billing-activate:v1');
  });
});