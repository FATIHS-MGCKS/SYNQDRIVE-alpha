import { Injectable } from '@nestjs/common';
import { BillingInterval } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BillingPeriodConfig,
  ResolvedBillingPeriodWindow,
  resolveBillingPeriodWindow,
} from './domain/billing-period-resolver';

@Injectable()
export class BillingPeriodResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForOrganization(
    organizationId: string,
    reference: Date = new Date(),
  ): Promise<ResolvedBillingPeriodWindow> {
    const [organization, subscription] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { timezone: true },
      }),
      this.prisma.billingSubscription.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        select: {
          currentPeriodStart: true,
          currentPeriodEnd: true,
          billingAnchorDay: true,
          priceBookId: true,
          startedAt: true,
        },
      }),
    ]);

    const priceBook = subscription?.priceBookId
      ? await this.prisma.billingPriceBook.findUnique({
          where: { id: subscription.priceBookId },
          select: { interval: true },
        })
      : null;

    const anchorMonth = subscription?.startedAt
      ? Number(
          new Intl.DateTimeFormat('en-US', {
            timeZone: organization?.timezone?.trim() || 'UTC',
            month: 'numeric',
          }).format(subscription.startedAt),
        )
      : 1;

    const config: BillingPeriodConfig = {
      interval: priceBook?.interval ?? BillingInterval.MONTHLY,
      anchorDay: subscription?.billingAnchorDay ?? 1,
      anchorMonth,
      timezone: organization?.timezone?.trim() || 'UTC',
    };

    return resolveBillingPeriodWindow({
      reference,
      config,
      subscriptionPeriod:
        subscription?.currentPeriodStart && subscription?.currentPeriodEnd
          ? {
              periodStart: subscription.currentPeriodStart,
              periodEnd: subscription.currentPeriodEnd,
            }
          : null,
    });
  }
}
