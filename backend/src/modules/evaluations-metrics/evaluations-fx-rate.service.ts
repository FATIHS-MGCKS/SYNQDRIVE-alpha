import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { createAnalyticsFxContext } from '@synq/fx/fx.analytics-resolver';
import type { AnalyticsFxContext } from '@synq/fx/fx.contract';
import {
  resolveOrgReportingCurrency,
  type OrgReportingCurrencyResolution,
} from '@synq/fx/fx.org-reporting-currency';
import { createReferenceFxRateProvider } from '@synq/fx/fx.provider';

/**
 * Reporting-layer FX for Auswertungen analytics.
 * Uses in-memory reference rates until a persisted rate table is introduced.
 */
@Injectable()
export class EvaluationsFxRateService {
  private readonly referenceProvider = createReferenceFxRateProvider();

  constructor(private readonly prisma: PrismaService) {}

  async resolveReportingCurrency(organizationId: string): Promise<OrgReportingCurrencyResolution> {
    const [paymentAccount, priceBook] = await Promise.all([
      this.prisma.organizationPaymentAccount.findFirst({
        where: { organizationId },
        select: { defaultCurrency: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.priceBook.findFirst({
        where: { organizationId, isActive: true },
        select: { currency: true },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return resolveOrgReportingCurrency({
      paymentAccountDefaultCurrency: paymentAccount?.defaultCurrency,
      primaryPriceBookCurrency: priceBook?.currency,
      platformDefaultCurrency: 'EUR',
    });
  }

  createAnalyticsContext(resolution: OrgReportingCurrencyResolution): AnalyticsFxContext | null {
    if (!resolution.currency || resolution.source === 'unconfigured') return null;
    return createAnalyticsFxContext(
      resolution.currency,
      resolution.source,
      this.referenceProvider,
      { maxRateAgeDays: 30 },
    );
  }

  async getAnalyticsContextForOrg(organizationId: string): Promise<{
    resolution: OrgReportingCurrencyResolution;
    fxContext: AnalyticsFxContext | null;
  }> {
    const resolution = await this.resolveReportingCurrency(organizationId);
    return {
      resolution,
      fxContext: this.createAnalyticsContext(resolution),
    };
  }
}
