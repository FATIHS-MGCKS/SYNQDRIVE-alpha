import { Injectable } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BillingAddonKey,
  BillingProductKind,
  SubscriptionStatus,
  mapProductSlugToBillingProductKind,
} from '../domain';
import { ResolvedEntitlement, ResolvedEntitlementSet } from '../domain/billing-resolver.types';
import { SubscriptionResolverService } from './subscription-resolver.service';

const BASE_PRODUCT_FEATURES: Record<BillingProductKind, string[]> = {
  [BillingProductKind.RENTAL]: ['rental.core', 'rental.bookings', 'rental.pricing'],
  [BillingProductKind.FLEET]: ['fleet.core', 'fleet.vehicles', 'fleet.telemetry'],
  [BillingProductKind.ADDON]: [],
};

const ADDON_FEATURES: Record<BillingAddonKey, string[]> = {
  [BillingAddonKey.VOICE_AGENT]: ['addon.voice_agent'],
  [BillingAddonKey.AI_PACKAGE]: ['addon.ai_package'],
  [BillingAddonKey.WHATSAPP]: ['addon.whatsapp'],
};

const GRANTING_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.CANCEL_SCHEDULED,
  SubscriptionStatus.PAST_DUE,
];

@Injectable()
export class EntitlementResolverService {
  constructor(
    private readonly subscriptionResolver: SubscriptionResolverService,
    private readonly prisma: PrismaService,
  ) {}

  async resolveEntitlements(
    organizationId: string,
    asOf: Date = new Date(),
  ): Promise<ResolvedEntitlementSet> {
    const contract = await this.subscriptionResolver.resolveContract(organizationId, { asOf });
    const legacyProducts = await this.prisma.organizationProduct.findMany({
      where: { organizationId },
      include: { product: { select: { slug: true, name: true } } },
    });

    const subscriptionGrants = this.entitlementsFromContract(contract.status, contract.items);
    const legacyGrants = this.entitlementsFromLegacyLicenses(legacyProducts);

    const merged = this.mergeEntitlements(subscriptionGrants, legacyGrants);

    return {
      organizationId,
      subscriptionStatus: contract.subscriptionId ? contract.status : null,
      entitlements: merged,
      resolvedAt: asOf,
    };
  }

  private entitlementsFromContract(
    status: SubscriptionStatus,
    items: Array<{ productKind: BillingProductKind; addonKey: BillingAddonKey | null }>,
  ): ResolvedEntitlement[] {
    const granted = GRANTING_STATUSES.includes(status);
    const entitlements: ResolvedEntitlement[] = [];

    for (const item of items) {
      if (item.productKind === BillingProductKind.ADDON && item.addonKey) {
        for (const featureKey of ADDON_FEATURES[item.addonKey] ?? []) {
          entitlements.push({
            featureKey,
            productKind: BillingProductKind.ADDON,
            addonKey: item.addonKey,
            granted,
            source: 'SUBSCRIPTION',
            reason: granted ? null : `Subscription status ${status}`,
          });
        }
        continue;
      }

      for (const featureKey of BASE_PRODUCT_FEATURES[item.productKind] ?? []) {
        entitlements.push({
          featureKey,
          productKind: item.productKind,
          addonKey: null,
          granted,
          source: 'SUBSCRIPTION',
          reason: granted ? null : `Subscription status ${status}`,
        });
      }
    }

    return entitlements;
  }

  private entitlementsFromLegacyLicenses(
    orgProducts: Array<{
      status: string;
      product: { slug: ProductSlug; name: string };
    }>,
  ): ResolvedEntitlement[] {
    const entitlements: ResolvedEntitlement[] = [];

    for (const row of orgProducts) {
      const active = row.status === 'ACTIVE' || row.status === 'TRIAL';
      const productKind = mapProductSlugToBillingProductKind(row.product.slug);
      const features =
        productKind === BillingProductKind.ADDON
          ? []
          : (BASE_PRODUCT_FEATURES[productKind] ?? []);

      for (const featureKey of features) {
        entitlements.push({
          featureKey,
          productKind,
          addonKey: null,
          granted: active,
          source: 'LEGACY_LICENSE',
          reason: active ? null : `Legacy license ${row.status}`,
        });
      }
    }

    return entitlements;
  }

  private mergeEntitlements(
    subscription: ResolvedEntitlement[],
    legacy: ResolvedEntitlement[],
  ): ResolvedEntitlement[] {
    const byKey = new Map<string, ResolvedEntitlement>();

    for (const ent of legacy) {
      byKey.set(ent.featureKey, ent);
    }
    for (const ent of subscription) {
      const existing = byKey.get(ent.featureKey);
      if (!existing || ent.granted) {
        byKey.set(ent.featureKey, ent);
      }
    }

    return [...byKey.values()].sort((a, b) => a.featureKey.localeCompare(b.featureKey));
  }
}
