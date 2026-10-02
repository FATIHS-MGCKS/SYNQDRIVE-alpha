import {
  BillingSubscriptionItemRole,
  type Prisma,
} from '@prisma/client';
import { RegistryBillingPermanentIntegrityError } from '../registry-lifecycle/registry-billing-permanent-integrity.error';

export type BaseSubscriptionItemAt = {
  id: string;
  subscriptionId: string;
  organizationId: string;
};

function isSubscriptionApplicableAt(
  subscription: {
    startedAt: Date | null;
    endedAt: Date | null;
    status: string;
  },
  asOf: Date,
): boolean {
  if (subscription.startedAt != null && subscription.startedAt > asOf) return false;
  if (subscription.endedAt != null && subscription.endedAt < asOf) return false;
  return true;
}

function isItemValidAt(
  item: { validFrom: Date; validTo: Date | null },
  asOf: Date,
): boolean {
  if (item.validFrom > asOf) return false;
  if (item.validTo != null && item.validTo < asOf) return false;
  return true;
}

export async function resolveBaseSubscriptionItemAsOf(
  db: Prisma.TransactionClient | Prisma.DefaultPrismaClient,
  organizationId: string,
  asOf: Date,
): Promise<BaseSubscriptionItemAt | null> {
  const items = await db.billingSubscriptionItem.findMany({
    where: {
      organizationId,
      itemRole: BillingSubscriptionItemRole.BASE_PLAN,
    },
    select: {
      id: true,
      subscriptionId: true,
      organizationId: true,
      validFrom: true,
      validTo: true,
      subscription: {
        select: {
          startedAt: true,
          endedAt: true,
          status: true,
        },
      },
    },
    orderBy: { validFrom: 'asc' },
  });

  const applicable = items.filter(
    (item) =>
      isItemValidAt(item, asOf) && isSubscriptionApplicableAt(item.subscription, asOf),
  );

  if (applicable.length > 1) {
    throw new RegistryBillingPermanentIntegrityError(
      'MULTIPLE_BASE_ITEMS_AT_EVENT_TIME',
      'Multiple base subscription items applicable at event time',
    );
  }

  if (applicable.length === 0) {
    return null;
  }

  const item = applicable[0]!;
  return {
    id: item.id,
    subscriptionId: item.subscriptionId,
    organizationId: item.organizationId,
  };
}
