import { Injectable } from '@nestjs/common';
import {
  EvaluationsAnalyticsScopeService,
  type EvaluationsAnalyticsActor,
} from '@modules/evaluations-analytics/evaluations-analytics-scope.service';
import { requireEvaluationsMetricDefinition } from '@modules/evaluations-metrics';
import type { EvaluationsMetricResponse } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsPeriodWindow } from '@synq/evaluations-periods/evaluations-period.contract';
import { EvaluationsMoneyError } from '@synq/evaluations-finance/evaluations-money';
import type { EvaluationsInvoiceFact } from '@synq/evaluations-finance/evaluations-finance-facts';
import {
  type EvaluationsFinanceWindow,
  computeCashInflow,
  computeExpenses,
  computeIssuedRevenue,
  computeNetResult,
  computeCurrentTotalReceivables,
  computeOverdueReceivables,
  computeProfitMargin,
  isCurrentReceivableReference,
  subtractAggregates,
} from '@synq/evaluations-finance/evaluations-finance-calculator';
import { EvaluationsFinanceRepository } from './evaluations-finance.repository';
import {
  mapFinanceMarginMetric,
  mapFinanceMoneyMetric,
} from './evaluations-finance-metric.mapper';

export interface ComputeFinancialInsightsInput {
  readonly actor: EvaluationsAnalyticsActor;
  readonly orgId: string;
  readonly requestedStationIds: readonly string[] | null;
  readonly reference?: Date;
  /** Evaluation "now" (defaults to the wall clock). Injectable for determinism. */
  readonly now?: Date;
}

/**
 * Canonical finance metric keys produced by this service. These reuse existing
 * registry metric IDs — E3 does not fork a second metric namespace.
 */
export const EVALUATIONS_FINANCE_METRIC_IDS = {
  issuedRevenue: 'fin.mtd_issued_revenue',
  paidRevenue: 'fin.mtd_paid_revenue',
  expenses: 'fin.mtd_expenses',
  netResult: 'fin.mtd_net_result',
  profitMargin: 'fin.profit_margin_mtd',
  openReceivables: 'fin.open_receivables',
  overdueReceivables: 'fin.overdue_receivables',
  totalOutstanding: 'fin.total_outstanding_receivables',
} as const;

export interface FinancialInsightsResult {
  readonly organizationId: string;
  readonly period: EvaluationsPeriodWindow;
  readonly metrics: Readonly<Record<string, EvaluationsMetricResponse>>;
}

/**
 * The single canonical finance calculation authority for evaluations.
 *
 * It consumes the E2 authorized analytics scope (organization + station + period
 * + timezone) and the E1 money/status/period contracts, and derives every money
 * metric from canonical financial facts through the shared calculator. It never
 * introduces a second period/scope/currency authority and never fabricates a
 * zero when the source or currency authority is missing.
 */
@Injectable()
export class EvaluationsFinanceService {
  constructor(
    private readonly scopeService: EvaluationsAnalyticsScopeService,
    private readonly repository: EvaluationsFinanceRepository,
  ) {}

  async computeFinancialInsights(
    input: ComputeFinancialInsightsInput,
  ): Promise<FinancialInsightsResult> {
    const scope = await this.scopeService.resolveAuthorizedScope({
      actor: input.actor,
      orgId: input.orgId,
      requestedStationIds: input.requestedStationIds,
      periodType: 'MTD',
      reference: input.reference,
    });

    const generatedAt = input.now ?? new Date();

    // Finance sources have no authoritative per-station attribution on current
    // main. A station-narrowed actor must therefore NOT receive org-wide
    // finance totals — fail closed rather than leak beyond the station scope.
    if (scope.stationScoped) {
      return this.buildUnavailableBundle(
        scope.organizationId,
        scope.period,
        generatedAt,
        'STATION_SCOPED_FINANCE_UNSUPPORTED',
      );
    }

    const window = toFinanceWindow(scope.period);
    const sourceWindow = { start: new Date(window.startMs), endExclusive: new Date(window.endExclusiveMs) };

    let invoices;
    let payments;
    let reportingCurrency: string | null;
    try {
      [invoices, payments, reportingCurrency] = await Promise.all([
        this.repository.loadInvoiceFacts(scope.organizationId, sourceWindow),
        this.repository.loadPaymentFacts(scope.organizationId, sourceWindow),
        this.repository.resolveReportingCurrency(scope.organizationId),
      ]);
    } catch {
      return this.buildUnavailableBundle(
        scope.organizationId,
        scope.period,
        generatedAt,
        'FINANCE_SOURCE_UNAVAILABLE',
      );
    }

    try {
      const issuedRevenue = computeIssuedRevenue(invoices, window);
      const paidRevenue = computeCashInflow(payments, window);
      const expenses = computeExpenses(invoices, window);
      const netResult = computeNetResult(issuedRevenue, expenses);
      const margin = computeProfitMargin(netResult, issuedRevenue);

      const money = (metricId: string, aggregate: typeof issuedRevenue) =>
        mapFinanceMoneyMetric({
          metricId,
          metricKind: requireEvaluationsMetricDefinition(metricId).metricKind,
          calculationVersion: requireEvaluationsMetricDefinition(metricId).calculationVersion,
          period: scope.period,
          generatedAt,
          aggregate,
          sourceAvailable: true,
          reportingCurrency,
        });

      const ids = EVALUATIONS_FINANCE_METRIC_IDS;
      const metrics: Record<string, EvaluationsMetricResponse> = {
        [ids.issuedRevenue]: money(ids.issuedRevenue, issuedRevenue),
        [ids.paidRevenue]: money(ids.paidRevenue, paidRevenue),
        [ids.expenses]: money(ids.expenses, expenses),
        [ids.netResult]: money(ids.netResult, netResult),
        [ids.profitMargin]: mapFinanceMarginMetric({
          metricId: ids.profitMargin,
          metricKind: requireEvaluationsMetricDefinition(ids.profitMargin).metricKind,
          calculationVersion: requireEvaluationsMetricDefinition(ids.profitMargin).calculationVersion,
          period: scope.period,
          generatedAt,
          margin,
          sourceAvailable: true,
        }),
        ...this.buildReceivableMetrics(invoices, scope.period, window, generatedAt, reportingCurrency),
      };

      return { organizationId: scope.organizationId, period: scope.period, metrics };
    } catch (error) {
      // Data integrity issues (e.g. an invalid/absent source currency) fail
      // closed as UNAVAILABLE rather than defaulting a currency.
      const reason =
        error instanceof EvaluationsMoneyError
          ? 'INVALID_SOURCE_CURRENCY'
          : 'FINANCE_CALCULATION_ERROR';
      return this.buildUnavailableBundle(scope.organizationId, scope.period, generatedAt, reason);
    }
  }

  /**
   * Receivables are a CURRENT snapshot of the authoritative outstanding balance.
   * A clearly historical reference cannot be honestly reconstructed from mutable
   * current outstanding, so those metrics fail closed (Option B) rather than
   * returning a false past value.
   */
  private buildReceivableMetrics(
    invoices: readonly EvaluationsInvoiceFact[],
    period: EvaluationsPeriodWindow,
    window: EvaluationsFinanceWindow,
    generatedAt: Date,
    reportingCurrency: string | null,
  ): Record<string, EvaluationsMetricResponse> {
    const ids = EVALUATIONS_FINANCE_METRIC_IDS;
    const receivableIds = [ids.openReceivables, ids.overdueReceivables, ids.totalOutstanding];

    if (!isCurrentReceivableReference(window.referenceMs, generatedAt.getTime())) {
      const out: Record<string, EvaluationsMetricResponse> = {};
      for (const metricId of receivableIds) {
        const definition = requireEvaluationsMetricDefinition(metricId);
        out[metricId] = mapFinanceMoneyMetric({
          metricId,
          metricKind: definition.metricKind,
          calculationVersion: definition.calculationVersion,
          period,
          generatedAt,
          aggregate: { perCurrency: [], includedCount: 0, excludedCount: 0 },
          sourceAvailable: false,
          reportingCurrency,
          unavailableReason: 'HISTORICAL_RECEIVABLE_RECONSTRUCTION_UNAVAILABLE',
        });
      }
      return out;
    }

    const totalOutstanding = computeCurrentTotalReceivables(invoices);
    const overdueReceivables = computeOverdueReceivables(invoices, window.referenceMs);
    const openReceivables = subtractAggregates(totalOutstanding, overdueReceivables);

    const money = (metricId: string, aggregate: typeof totalOutstanding) => {
      const definition = requireEvaluationsMetricDefinition(metricId);
      return mapFinanceMoneyMetric({
        metricId,
        metricKind: definition.metricKind,
        calculationVersion: definition.calculationVersion,
        period,
        generatedAt,
        aggregate,
        sourceAvailable: true,
        reportingCurrency,
      });
    };

    return {
      [ids.openReceivables]: money(ids.openReceivables, openReceivables),
      [ids.overdueReceivables]: money(ids.overdueReceivables, overdueReceivables),
      [ids.totalOutstanding]: money(ids.totalOutstanding, totalOutstanding),
    };
  }

  private buildUnavailableBundle(
    organizationId: string,
    period: EvaluationsPeriodWindow,
    generatedAt: Date,
    reason: string,
  ): FinancialInsightsResult {
    const emptyAggregate = { perCurrency: [], includedCount: 0, excludedCount: 0 } as const;
    const metrics: Record<string, EvaluationsMetricResponse> = {};
    for (const metricId of Object.values(EVALUATIONS_FINANCE_METRIC_IDS)) {
      const definition = requireEvaluationsMetricDefinition(metricId);
      if (metricId === EVALUATIONS_FINANCE_METRIC_IDS.profitMargin) {
        metrics[metricId] = mapFinanceMarginMetric({
          metricId,
          metricKind: definition.metricKind,
          calculationVersion: definition.calculationVersion,
          period,
          generatedAt,
          margin: { kind: 'NOT_APPLICABLE', reason },
          sourceAvailable: false,
          unavailableReason: reason,
        });
        continue;
      }
      metrics[metricId] = mapFinanceMoneyMetric({
        metricId,
        metricKind: definition.metricKind,
        calculationVersion: definition.calculationVersion,
        period,
        generatedAt,
        aggregate: emptyAggregate,
        sourceAvailable: false,
        reportingCurrency: null,
        // E3.4: propagate the specific upstream reason (e.g.
        // STATION_SCOPED_FINANCE_UNSUPPORTED) instead of collapsing to the generic
        // FINANCE_SOURCE_UNAVAILABLE.
        unavailableReason: reason,
      });
    }
    return { organizationId, period, metrics };
  }
}

function toFinanceWindow(period: EvaluationsPeriodWindow): EvaluationsFinanceWindow {
  return {
    startMs: Date.parse(period.start),
    endExclusiveMs: Date.parse(period.endExclusive),
    referenceMs: Date.parse(period.reference),
  };
}
