import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { EvaluationsMetricResponse } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import { EVALUATIONS_METRIC_RESPONSE_SCHEMA_VERSION } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import {
  buildAvailableMetric,
  buildComparison,
  buildErrorMetric,
  buildPartialMetric,
  buildStaleMetric,
  buildUnavailableMetric,
} from '@synq/evaluations-metrics/evaluations-metric-response.builder';
import type { EvaluationsMetricPeriodRef } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsPeriodWindow } from '@synq/evaluations-periods/evaluations-period.contract';
import { resolveEvaluationsMetricCalculationVersion } from '@synq/evaluations-metrics/evaluations-metric-calculation-versions';
import { EvaluationsPeriodService } from './evaluations-period.service';
import { EvaluationsFxRateService } from './evaluations-fx-rate.service';
import type { MultiCurrencyAnalyticsMeta } from '@synq/fx/fx.contract';
import {
  computeReceivablesAnalytics,
  computeRevenueCashflowContribution,
  FINANCIAL_KPI_EXCLUSIONS,
  latestInvoiceSourceAt,
  openOutgoingReceivables,
  overdueOutgoingReceivables,
  sumOutstandingCents,
  type FinancialKpiInvoiceRow,
  type ReceivablesAnalyticsResult,
  type RevenueCashflowContributionResult,
} from './financial-kpi.logic';

const SOURCE_STALE_MS = 24 * 60 * 60 * 1000;

export interface FinancialMtdKpiBundle {
  schemaVersion: string;
  generatedAt: string;
  timezone: EvaluationsPeriodWindow['timezone'];
  periods: {
    mtd: EvaluationsPeriodWindow;
    prevMonthSamePeriod: EvaluationsPeriodWindow;
    yoySamePeriod: EvaluationsPeriodWindow;
  } | null;
  metrics: EvaluationsMetricResponse[];
  receivablesAnalytics: ReceivablesAnalyticsResult | null;
  revenueCashflowContribution: RevenueCashflowContributionResult | null;
  multiCurrency: MultiCurrencyAnalyticsMeta | null;
}

@Injectable()
export class EvaluationsFinancialKpiService {
  private readonly logger = new Logger(EvaluationsFinancialKpiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly periodService: EvaluationsPeriodService,
    private readonly fxRateService: EvaluationsFxRateService,
  ) {}

  async getFinancialMtdBundle(input: {
    organizationId: string;
    stationId?: string | null;
    reference?: Date;
  }): Promise<FinancialMtdKpiBundle> {
    const generatedAt = new Date();
    const reference = input.reference ?? generatedAt;

    try {
      const periodBundle = await this.periodService.resolveReportingBundle({
        organizationId: input.organizationId,
        stationId: input.stationId,
        reference,
      });

      const invoices = await this.loadInvoices(input.organizationId);
      const { resolution, fxContext } = await this.fxRateService.getAnalyticsContextForOrg(
        input.organizationId,
      );
      const reportingCurrency = resolution.currency ?? 'EUR';
      const foreignOrExcludedCount =
        invoices.filter((inv) => {
          const c = (inv.currency ?? '').trim().toUpperCase();
          return !c || (c !== reportingCurrency && c !== '€');
        }).length;
      const latestSourceAt = latestInvoiceSourceAt(invoices);
      const isStale =
        latestSourceAt != null &&
        generatedAt.getTime() - latestSourceAt.getTime() > SOURCE_STALE_MS;

      const mtdFrom = new Date(periodBundle.mtd.periodStart);
      const mtdTo = new Date(periodBundle.mtd.periodEndInclusive);
      const prevFrom = new Date(periodBundle.prevMonthSamePeriod.periodStart);
      const prevTo = new Date(periodBundle.prevMonthSamePeriod.periodEndInclusive);

      const mtdPeriod = toPeriodRef(periodBundle.mtd);
      const snapshotPeriod: EvaluationsMetricPeriodRef = {
        preset: 'snapshot',
        periodStart: generatedAt.toISOString(),
        periodEndInclusive: generatedAt.toISOString(),
        timezone: periodBundle.timezone.effective,
      };

      const timezone = periodBundle.timezone.effective;

      const revenueCashflowContribution = computeRevenueCashflowContribution({
        invoices,
        periodStart: mtdFrom,
        periodEndInclusive: mtdTo,
        timezone,
        reportingCurrency,
        fxContext: fxContext ?? undefined,
      });
      const prevRevenueCashflow = computeRevenueCashflowContribution({
        invoices,
        periodStart: prevFrom,
        periodEndInclusive: prevTo,
        timezone,
        reportingCurrency,
        fxContext: fxContext ?? undefined,
      });

      const receivablesAnalytics = computeReceivablesAnalytics({
        invoices,
        reference,
        timezone,
        reportingCurrency,
        fxContext: fxContext ?? undefined,
      });
      const openRows = openOutgoingReceivables(invoices, reference, reportingCurrency);
      const overdueRows = overdueOutgoingReceivables(invoices, reference, timezone, reportingCurrency);

      const rcx = revenueCashflowContribution.metrics;
      const periodRevenueCents = rcx.periodRevenue.netAmountMinor;
      const invoicedRevenueCents = rcx.invoicedRevenue.amountMinor;
      const paymentReceiptsCents = rcx.paymentReceipts.amountMinor;
      const mtdExpenseCents = rcx.operatingExpenses.amountMinor;
      const netCashflowCents = rcx.netCashflow.amountMinor;
      const contributionCents = rcx.contributionMargin.netAmountMinor;
      const operatingResultCents = revenueCashflowContribution.completeness.operatingResultVisible
        ? rcx.operatingResult?.netAmountMinor ?? null
        : null;
      const profitMargin =
        operatingResultCents != null && periodRevenueCents > 0
          ? (operatingResultCents / periodRevenueCents) * 100
          : 0;

      const multiCurrency =
        revenueCashflowContribution.multiCurrency ?? receivablesAnalytics.multiCurrency;
      const fxPartial =
        multiCurrency.completeness === 'PARTIAL' || multiCurrency.completeness === 'UNAVAILABLE';

      const baseCoverage = {
        rowsObserved: invoices.length,
        rowsExpected: null,
        missingSources: [
          ...(fxPartial ? ['multi_currency_partial'] : []),
          ...(multiCurrency.dataQuality.missingRateCount > 0 ? ['fx_rate_unavailable'] : []),
          ...(multiCurrency.dataQuality.staleRateCount > 0 ? ['fx_rate_stale'] : []),
          ...(multiCurrency.dataQuality.missingCurrencyCount > 0
            ? ['documents_missing_currency']
            : []),
          ...(foreignOrExcludedCount > 0 && !fxContext
            ? [FINANCIAL_KPI_EXCLUSIONS.nonEur]
            : []),
          ...(receivablesAnalytics.dataQuality.missingDueDateCount > 0
            ? ['receivables_missing_due_date']
            : []),
          ...(revenueCashflowContribution.completeness.costBasis === 'PARTIAL'
            ? revenueCashflowContribution.completeness.reasons
            : []),
        ],
        ratio:
          fxPartial || receivablesAnalytics.dataQuality.missingDueDateCount > 0
            ? Math.max(
                0,
                (invoices.length - multiCurrency.dataQuality.excludedCount) /
                  Math.max(invoices.length, 1),
              )
            : 1,
      };

      const freshness = {
        latestSourceAt: latestSourceAt?.toISOString() ?? null,
        staleAfterMs: SOURCE_STALE_MS,
        isStale,
        reason: isStale ? 'Invoice data older than 24h' : null,
      };

      const exclusions = [
        `revenue_excluded_statuses:${FINANCIAL_KPI_EXCLUSIONS.revenue.join(',')}`,
        `expense_excluded_statuses:${FINANCIAL_KPI_EXCLUSIONS.expense.join(',')}`,
      ];

      const buildMoney = (
        metricId: string,
        cents: number,
        period: EvaluationsMetricPeriodRef,
        extra?: Partial<Parameters<typeof buildAvailableMetric>[0]>,
      ): EvaluationsMetricResponse => {
        const calcVersion = resolveEvaluationsMetricCalculationVersion(metricId);
        const payload = {
          metricId,
          value: cents,
          unit: 'EUR_CENTS' as const,
          currency: reportingCurrency,
          generatedAt,
          period,
          calculationVersion: calcVersion,
          exclusions,
          dataCoverage: baseCoverage,
          sourceFreshness: freshness,
          ...extra,
        };

        if (invoices.length === 0) {
          return buildUnavailableMetric({
            ...payload,
            reason: 'No invoice rows available for organization',
          });
        }

        const rcxPartial = revenueCashflowContribution.completeness.costBasis === 'PARTIAL';

        if (isStale) {
          return buildStaleMetric({
            ...payload,
            value: cents,
            sourceFreshness: { ...freshness, isStale: true, reason: freshness.reason! },
          });
        }

        if (fxPartial || rcxPartial) {
          return buildPartialMetric({
            ...payload,
            value: cents,
            dataCoverage: baseCoverage,
          });
        }

        return buildAvailableMetric({ ...payload, value: cents });
      };

      const buildOperatingResultMetric = (): EvaluationsMetricResponse => {
        const metricId = 'fin.mtd_net_result';
        const calcVersion = resolveEvaluationsMetricCalculationVersion(metricId);
        const payload = {
          metricId,
          unit: 'EUR_CENTS' as const,
          currency: reportingCurrency,
          generatedAt,
          period: mtdPeriod,
          calculationVersion: calcVersion,
          exclusions,
          dataCoverage: baseCoverage,
          sourceFreshness: freshness,
          comparison: null,
        };
        if (invoices.length === 0) {
          return buildUnavailableMetric({ ...payload, reason: 'No invoice rows available for organization' });
        }
        if (!revenueCashflowContribution.completeness.operatingResultVisible || operatingResultCents == null) {
          return buildPartialMetric({
            ...payload,
            value: 0,
            dataCoverage: baseCoverage,
            warnings: ['operating_result_hidden_incomplete_cost_basis'],
          });
        }
        if (isStale) {
          return buildStaleMetric({
            ...payload,
            value: operatingResultCents,
            sourceFreshness: { ...freshness, isStale: true, reason: freshness.reason! },
          });
        }
        return buildAvailableMetric({ ...payload, value: operatingResultCents });
      };

      const profitMarginMetric = (): EvaluationsMetricResponse => {
        const metricId = 'fin.profit_margin_mtd';
        const calcVersion = resolveEvaluationsMetricCalculationVersion(metricId);
        const payload = {
          metricId,
          unit: 'PERCENT' as const,
          currency: null,
          generatedAt,
          period: mtdPeriod,
          calculationVersion: calcVersion,
          exclusions,
          dataCoverage: baseCoverage,
          sourceFreshness: freshness,
          comparison: null,
        };
        if (invoices.length === 0) {
          return buildUnavailableMetric({ ...payload, reason: 'No invoice rows available for organization' });
        }
        if (!revenueCashflowContribution.completeness.operatingResultVisible) {
          return buildPartialMetric({
            ...payload,
            value: 0,
            dataCoverage: baseCoverage,
            warnings: ['profit_margin_hidden_incomplete_cost_basis'],
          });
        }
        if (isStale) {
          return buildStaleMetric({
            ...payload,
            value: profitMargin,
            sourceFreshness: { ...freshness, isStale: true, reason: freshness.reason! },
          });
        }
        return buildAvailableMetric({ ...payload, value: profitMargin });
      };

      const metrics: EvaluationsMetricResponse[] = [
        buildMoney('fin.mtd_issued_revenue', periodRevenueCents, mtdPeriod, {
          comparison: buildComparison({
            type: 'mom',
            currentValue: periodRevenueCents,
            priorValue: prevRevenueCashflow.metrics.periodRevenue.netAmountMinor,
          }),
        }),
        buildMoney('fin.issued_revenue_strict_mtd', invoicedRevenueCents, mtdPeriod),
        buildMoney('fin.mtd_paid_revenue', paymentReceiptsCents, mtdPeriod),
        buildMoney('fin.cash_inflow_mtd', paymentReceiptsCents, mtdPeriod),
        buildMoney('fin.cashflow_net_mtd', netCashflowCents, mtdPeriod),
        buildMoney('fin.mtd_expenses', mtdExpenseCents, mtdPeriod),
        buildMoney('fin.contribution_margin_mtd', contributionCents, mtdPeriod),
        buildOperatingResultMetric(),
        profitMarginMetric(),
        buildMoney('fin.open_receivables', sumOutstandingCents(openRows), snapshotPeriod),
        buildMoney('fin.overdue_receivables', sumOutstandingCents(overdueRows), snapshotPeriod),
        buildMoney(
          'fin.total_outstanding_receivables',
          receivablesAnalytics.metrics.openTotal.amountMinor,
          snapshotPeriod,
        ),
      ];

      return {
        schemaVersion: EVALUATIONS_METRIC_RESPONSE_SCHEMA_VERSION,
        generatedAt: generatedAt.toISOString(),
        timezone: periodBundle.timezone,
        periods: {
          mtd: periodBundle.mtd,
          prevMonthSamePeriod: periodBundle.prevMonthSamePeriod,
          yoySamePeriod: periodBundle.yoySamePeriod,
        },
        metrics,
        receivablesAnalytics,
        revenueCashflowContribution,
        multiCurrency,
      };
    } catch (err: unknown) {
      this.logger.warn(
        `Financial MTD KPI bundle failed for org ${input.organizationId}: ${err instanceof Error ? err.message : err}`,
      );
      const fallbackPeriod: EvaluationsMetricPeriodRef = {
        preset: 'mtd',
        periodStart: reference.toISOString(),
        periodEndInclusive: reference.toISOString(),
        timezone: 'Europe/Berlin',
      };
      const errorMetric = (metricId: string) =>
        buildErrorMetric({
          metricId,
          unit: 'EUR_CENTS',
          currency: 'EUR',
          generatedAt,
          period: fallbackPeriod,
          calculationVersion: resolveEvaluationsMetricCalculationVersion(metricId),
          exclusions: [],
          error: 'Financial KPI computation failed',
        });

      return {
        schemaVersion: EVALUATIONS_METRIC_RESPONSE_SCHEMA_VERSION,
        generatedAt: generatedAt.toISOString(),
        timezone: {
          effective: 'Europe/Berlin',
          organization: 'Europe/Berlin',
          station: null,
          source: 'organization',
        },
        periods: null,
        metrics: [
          errorMetric('fin.mtd_issued_revenue'),
          errorMetric('fin.mtd_expenses'),
          errorMetric('fin.mtd_net_result'),
        ],
        receivablesAnalytics: null,
        revenueCashflowContribution: null,
        multiCurrency: null,
      };
    }
  }

  private async loadInvoices(organizationId: string): Promise<FinancialKpiInvoiceRow[]> {
    const rows = await this.prisma.orgInvoice.findMany({
      where: { organizationId },
      select: {
        id: true,
        type: true,
        status: true,
        totalCents: true,
        subtotalCents: true,
        taxCents: true,
        paidCents: true,
        outstandingCents: true,
        currency: true,
        invoiceDate: true,
        dueDate: true,
        paidAt: true,
        cancelledAt: true,
        creditedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows;
  }
}

function toPeriodRef(window: EvaluationsPeriodWindow): EvaluationsMetricPeriodRef {
  return {
    preset: window.preset,
    periodStart: window.periodStart,
    periodEndInclusive: window.periodEndInclusive,
    timezone: window.timezone.effective,
  };
}
