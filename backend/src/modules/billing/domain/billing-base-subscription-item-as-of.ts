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

function isEntityOrdinaryAuthorityAt(entity: { createdAt: Date }, asOf: Date): boolean {
  return entity.createdAt.getTime() <= asOf.getTime();
}

function isSubscriptionApplicableAt(
  subscription: {
    createdAt: Date;
    startedAt: Date | null;
    endedAt: Date | null;
  },
  asOf: Date,
): boolean {
  if (!isEntityOrdinaryAuthorityAt(subscription, asOf)) return false;
  if (subscription.startedAt != null && subscription.startedAt > asOf) return false;
  if (subscription.endedAt != null && subscription.endedAt < asOf) return false;
  return true;
}

function isItemValidAt(
  item: { createdAt: Date; validFrom: Date; validTo: Date | null },
  asOf: Date,
): boolean {
  if (!isEntityOrdinaryAuthorityAt(item, asOf)) return false;
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
      createdAt: true,
      validFrom: true,
      validTo: true,
      subscription: {
        select: {
          createdAt: true,
          startedAt: true,
          endedAt: true,
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
