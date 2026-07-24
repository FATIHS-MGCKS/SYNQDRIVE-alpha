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
import {
  expensesInRange,
  FINANCIAL_KPI_EXCLUSIONS,
  isEurInvoice,
  latestInvoiceSourceAt,
  mtdRevenueInRange,
  openOutgoingReceivables,
  overdueOutgoingReceivables,
  paidRevenueInRange,
  sumCents,
  type FinancialKpiInvoiceRow,
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
}

@Injectable()
export class EvaluationsFinancialKpiService {
  private readonly logger = new Logger(EvaluationsFinancialKpiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly periodService: EvaluationsPeriodService,
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
      const nonEurCount = invoices.filter((inv) => !isEurInvoice(inv)).length;
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

      const mtdRevenueRows = mtdRevenueInRange(invoices, mtdFrom, mtdTo);
      const prevRevenueRows = mtdRevenueInRange(invoices, prevFrom, prevTo);
      const mtdExpenseRows = expensesInRange(invoices, mtdFrom, mtdTo);
      const mtdPaidRows = paidRevenueInRange(invoices, mtdFrom, mtdTo);
      const openRows = openOutgoingReceivables(invoices, reference);
      const overdueRows = overdueOutgoingReceivables(invoices, reference);

      const mtdRevenueCents = sumCents(mtdRevenueRows);
      const mtdExpenseCents = sumCents(mtdExpenseRows);
      const mtdNetCents = mtdRevenueCents - mtdExpenseCents;
      const profitMargin =
        mtdRevenueCents > 0 ? (mtdNetCents / mtdRevenueCents) * 100 : 0;

      const baseCoverage = {
        rowsObserved: invoices.length,
        rowsExpected: null,
        missingSources: nonEurCount > 0 ? [FINANCIAL_KPI_EXCLUSIONS.nonEur] : [],
        ratio: nonEurCount > 0 ? (invoices.length - nonEurCount) / invoices.length : 1,
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
          currency: 'EUR',
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

        if (isStale) {
          return buildStaleMetric({
            ...payload,
            value: cents,
            sourceFreshness: { ...freshness, isStale: true, reason: freshness.reason! },
          });
        }

        if (nonEurCount > 0) {
          return buildPartialMetric({
            ...payload,
            value: cents,
            dataCoverage: baseCoverage,
          });
        }

        return buildAvailableMetric({ ...payload, value: cents });
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
        buildMoney('fin.mtd_issued_revenue', mtdRevenueCents, mtdPeriod, {
          comparison: buildComparison({
            type: 'mom',
            currentValue: mtdRevenueCents,
            priorValue: sumCents(prevRevenueRows),
          }),
        }),
        buildMoney('fin.mtd_paid_revenue', sumCents(mtdPaidRows), mtdPeriod),
        buildMoney('fin.mtd_expenses', mtdExpenseCents, mtdPeriod),
        buildMoney('fin.mtd_net_result', mtdNetCents, mtdPeriod),
        profitMarginMetric(),
        buildMoney('fin.open_receivables', sumCents(openRows), snapshotPeriod),
        buildMoney('fin.overdue_receivables', sumCents(overdueRows), snapshotPeriod),
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
        currency: true,
        invoiceDate: true,
        dueDate: true,
        paidAt: true,
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
