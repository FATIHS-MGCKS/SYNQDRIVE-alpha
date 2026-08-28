import { BillingAddonKey, SubscriptionStatus } from './domain/billing-domain.types';
import { BillingEntitlementAccessStatus, BillingEntitlementSource } from './domain/billing-entitlements';
import { resolveAddOnDtos } from './tenant-subscription-overview.mapper';
import type { BillingAddonEntitlement, BillingEntitlementSnapshot } from './domain/billing-entitlements';

describe('resolveAddOnDtos', () => {
  const asOf = '2026-08-28T12:00:00.000Z';

  function buildAddon(
    partial: Pick<BillingAddonEntitlement, 'addonKey' | 'status' | 'active'>,
  ): BillingAddonEntitlement {
    return {
      ...partial,
      validFrom: asOf,
      validTo: null,
      limits: { maxVehicles: null, maxUsers: null, maxStations: null, features: [] },
      source: BillingEntitlementSource.BILLING_CONTRACT,
      lastUpdatedAt: asOf,
    };
  }

  function buildSnapshot(
    addons: BillingEntitlementSnapshot['addons'],
  ): BillingEntitlementSnapshot {
    return {
      organizationId: 'org-x7',
      baseProduct: 'RENTAL',
      addonKeys: addons.map((addon) => addon.addonKey),
      activeAddonKeys: addons.filter((addon) => addon.active).map((addon) => addon.addonKey),
      status: BillingEntitlementAccessStatus.ACTIVE,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      active: true,
      validFrom: asOf,
      validTo: null,
      limits: { maxVehicles: null, maxUsers: null, maxStations: null, features: [] },
      source: 'BILLING_CONTRACT',
      lastUpdatedAt: asOf,
      resolvedAt: asOf,
      addons,
      gracePeriodEndsAt: null,
      inGracePeriod: false,
    };
  }

  it('exposes machine status alongside existing DTO fields', () => {
    const result = resolveAddOnDtos(
      buildSnapshot([
        buildAddon({
          addonKey: BillingAddonKey.VOICE_AGENT,
          status: BillingEntitlementAccessStatus.ACTIVE,
          active: true,
        }),
        buildAddon({
          addonKey: BillingAddonKey.AI_PACKAGE,
          status: BillingEntitlementAccessStatus.TRIALING,
          active: true,
        }),
      ]),
    );

    expect(result).toEqual([
      {
        key: 'VOICE_AGENT',
        name: 'Sprachassistent',
        status: 'ACTIVE',
        statusLabel: 'Aktiv',
        active: true,
      },
      {
        key: 'AI_PACKAGE',
        name: 'KI-Paket',
        status: 'TRIALING',
        statusLabel: 'Testphase',
        active: true,
      },
    ]);
  });

  it('preserves inactive add-ons only when filtered upstream remains unchanged in mapper', () => {
    const result = resolveAddOnDtos(
      buildSnapshot([
        buildAddon({
          addonKey: BillingAddonKey.WHATSAPP,
          status: BillingEntitlementAccessStatus.INACTIVE,
          active: false,
        }),
      ]),
    );

    expect(result).toEqual([]);
  });
});
