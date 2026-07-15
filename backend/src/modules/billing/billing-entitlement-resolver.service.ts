import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BillingEntitlementContractInput,
  BillingEntitlementSnapshot,
  resolveBillingEntitlements,
} from './domain/billing-entitlements';

export interface ResolveBillingEntitlementsOptions {
  asOf?: Date;
}

@Injectable()
export class BillingEntitlementResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    organizationId: string,
    opts: ResolveBillingEntitlementsOptions = {},
  ): Promise<BillingEntitlementSnapshot> {
    const asOf = opts.asOf ?? new Date();
    const contract = await this.loadBillingContract(organizationId);
    return resolveBillingEntitlements(organizationId, contract, asOf);
  }

  private async loadBillingContract(
    organizationId: string,
  ): Promise<BillingEntitlementContractInput> {
    const subscription = await this.prisma.billingSubscription.findFirst({
      where: {
        organizationId,
        endedAt: null,
        status: { not: 'CANCELLED' },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        cancelAtPeriodEnd: true,
        trialStartAt: true,
        trialEndAt: true,
        startedAt: true,
        endedAt: true,
        cancelAt: true,
        currentPeriodEnd: true,
        updatedAt: true,
      },
    });

    if (!subscription) {
      return { subscription: null, items: [] };
    }

    const items = await this.prisma.billingSubscriptionItem.findMany({
      where: {
        organizationId,
        subscriptionId: subscription.id,
        status: {
          notIn: ['ENDED', 'CANCELLED'],
        },
      },
      include: {
        billingProduct: {
          select: {
            key: true,
            metadata: true,
          },
        },
      },
      orderBy: { validFrom: 'desc' },
    });

    return {
      subscription,
      items: items.map((item) => ({
        id: item.id,
        itemRole: item.itemRole,
        status: item.status,
        validFrom: item.validFrom,
        validTo: item.validTo,
        updatedAt: item.updatedAt,
        productKey: item.billingProduct.key,
        metadata:
          item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
            ? (item.metadata as Record<string, unknown>)
            : item.billingProduct.metadata &&
                typeof item.billingProduct.metadata === 'object' &&
                !Array.isArray(item.billingProduct.metadata)
              ? (item.billingProduct.metadata as Record<string, unknown>)
              : null,
      })),
    };
  }
}
