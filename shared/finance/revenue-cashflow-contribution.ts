import {
  buildMultiCurrencyMeta,
  resolveReportingAmountMinor,
  trackConversion,
} from '@synq/fx/fx.analytics-resolver';
import { emptyMultiCurrencyDataQuality } from '@synq/fx/fx.contract';
import { convertMinorForReporting } from '@synq/fx/fx.convert';
import type { AnalyticsFxContext } from '@synq/fx/fx.contract';
import {
  isOutgoingInvoiceType,
  normalizeInvoiceStatus,
  parseInvoiceInstant,
} from '@synq/receivables/receivables-analytics';

import type {
  FinanceInvoiceRow,
  FinanceMoneyBucket,
  RevenueCashflowContributionResult,
} from './revenue-cashflow-contribution.contract';

const INCOMING_TYPES = new Set(['INCOMING_VENDOR', 'INCOMING_UPLOADED']);

const REVENUE_EXCLUDED = new Set(['DRAFT', 'CANCELLED', 'CANCELED', 'VOID', 'CREDITED']);
const EXPENSE_EXCLUDED = new Set(['DRAFT', 'CANCELLED', 'CANCELED', 'VOID', 'REJECTED']);
const REFUND_STATUSES = new Set(['REFUNDED', 'PARTIALLY_REFUNDED']);
const PERIOD_ADJUSTMENT_STATUSES = new Set(['CREDITED', ...REFUND_STATUSES]);

export interface ComputeRevenueCashflowInput {
  invoices: FinanceInvoiceRow[];
  periodStart: Date;
  periodEndInclusive: Date;
  timezone?: string;
  reportingCurrency?: string;
  fxContext?: AnalyticsFxContext;
}

function emptyBucket(currency: string): FinanceMoneyBucket {
  return { amountMinor: 0, netAmountMinor: 0, taxAmountMinor: 0, invoiceCount: 0, currency };
}

function resolveNetTaxTotal(inv: FinanceInvoiceRow): {
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
} {
  const gross = Math.max(0, inv.totalCents ?? 0);
  const tax =
    typeof inv.taxCents === 'number' && Number.isFinite(inv.taxCents)
      ? Math.max(0, Math.trunc(inv.taxCents))
      : 0;
  const net =
    typeof inv.subtotalCents === 'number' && Number.isFinite(inv.subtotalCents)
      ? Math.max(0, Math.trunc(inv.subtotalCents))
      : Math.max(0, gross - tax);
  return { netMinor: net, taxMinor: tax, grossMinor: gross };
}

function inPeriod(instant: Date | null, from: Date, to: Date): boolean {
  if (!instant || Number.isNaN(instant.getTime())) return false;
  return instant >= from && instant <= to;
}

function effectiveInvoiceDate(inv: FinanceInvoiceRow): Date | null {
  return parseInvoiceInstant(inv.invoiceDate) ?? parseInvoiceInstant(inv.createdAt);
}

function adjustmentDate(inv: FinanceInvoiceRow): Date | null {
  return (
    parseInvoiceInstant(inv.creditedAt) ??
    parseInvoiceInstant(inv.cancelledAt) ??
    effectiveInvoiceDate(inv)
  );
}

function isRevenueInvoice(inv: FinanceInvoiceRow): boolean {
  if (!isOutgoingInvoiceType(inv.type)) return false;
  return !REVENUE_EXCLUDED.has(normalizeInvoiceStatus(inv.status));
}

function isExpenseInvoice(inv: FinanceInvoiceRow): boolean {
  if (!INCOMING_TYPES.has(inv.type)) return false;
  return !EXPENSE_EXCLUDED.has(normalizeInvoiceStatus(inv.status));
}

function isVariableCostInvoice(_inv: FinanceInvoiceRow): boolean {
  return false;
}

function addToBucket(bucket: FinanceMoneyBucket, net: number, tax: number, gross: number): void {
  bucket.netAmountMinor += net;
  bucket.taxAmountMinor += tax;
  bucket.amountMinor += gross;
  bucket.invoiceCount += 1;
}

function convertAmount(
  amountMinor: number,
  inv: FinanceInvoiceRow,
  rateDate: Date,
  reportingCurrency: string,
  fxContext: AnalyticsFxContext | undefined,
  dataQuality: ReturnType<typeof emptyMultiCurrencyDataQuality>,
): number | null {
  return resolveReportingAmountMinor(
    amountMinor,
    inv.currency,
    rateDate,
    fxContext,
    reportingCurrency,
    dataQuality,
  );
}

function convertTriple(
  inv: FinanceInvoiceRow,
  rateDate: Date,
  reportingCurrency: string,
  fxContext: AnalyticsFxContext | undefined,
  dataQuality: ReturnType<typeof emptyMultiCurrencyDataQuality>,
): { net: number; tax: number; gross: number } | null {
  const { netMinor, taxMinor, grossMinor } = resolveNetTaxTotal(inv);

  if (fxContext) {
    const netResult = convertMinorForReporting(netMinor, inv.currency, rateDate, fxContext);
    trackConversion(dataQuality, netResult.conversionStatus);
    if (netResult.convertedAmountMinor == null) return null;

    const taxResult = convertMinorForReporting(taxMinor, inv.currency, rateDate, fxContext);
    const grossResult = convertMinorForReporting(grossMinor, inv.currency, rateDate, fxContext);
    if (taxResult.convertedAmountMinor == null || grossResult.convertedAmountMinor == null) {
      return null;
    }
    return {
      net: netResult.convertedAmountMinor,
      tax: taxResult.convertedAmountMinor,
      gross: grossResult.convertedAmountMinor,
    };
  }

  const convertedNet = convertAmount(netMinor, inv, rateDate, reportingCurrency, fxContext, dataQuality);
  if (convertedNet == null) return null;
  const convertedTax = convertAmount(taxMinor, inv, rateDate, reportingCurrency, fxContext, dataQuality);
  const convertedGross = convertAmount(grossMinor, inv, rateDate, reportingCurrency, fxContext, dataQuality);
  if (convertedTax == null || convertedGross == null) return null;
  return { net: convertedNet, tax: convertedTax, gross: convertedGross };
}

function paymentAmountInPeriod(
  inv: FinanceInvoiceRow,
  from: Date,
  to: Date,
  reportingCurrency: string,
  fxContext: AnalyticsFxContext | undefined,
  dataQuality: ReturnType<typeof emptyMultiCurrencyDataQuality>,
): number {
  const paidAt = parseInvoiceInstant(inv.paidAt);
  if (!paidAt || !inPeriod(paidAt, from, to)) return 0;
  const paid = Math.max(0, inv.paidCents ?? 0);
  let amount = paid;
  if (amount <= 0) {
    const status = normalizeInvoiceStatus(inv.status);
    if (status === 'PAID') amount = Math.max(0, inv.totalCents ?? 0);
    else return 0;
  }
  const converted = convertAmount(amount, inv, paidAt, reportingCurrency, fxContext, dataQuality);
  return converted ?? 0;
}

function expenseCashOutInPeriod(
  inv: FinanceInvoiceRow,
  from: Date,
  to: Date,
  reportingCurrency: string,
  fxContext: AnalyticsFxContext | undefined,
  dataQuality: ReturnType<typeof emptyMultiCurrencyDataQuality>,
): number {
  const paidAt = parseInvoiceInstant(inv.paidAt);
  if (paidAt && inPeriod(paidAt, from, to)) {
    const paid = inv.paidCents ?? 0;
    if (paid > 0) {
      const converted = convertAmount(paid, inv, paidAt, reportingCurrency, fxContext, dataQuality);
      return converted ?? 0;
    }
    if (normalizeInvoiceStatus(inv.status) === 'PAID') {
      const converted = convertAmount(
        Math.max(0, inv.totalCents ?? 0),
        inv,
        paidAt,
        reportingCurrency,
        fxContext,
        dataQuality,
      );
      return converted ?? 0;
    }
  }
  const invoiceDate = effectiveInvoiceDate(inv);
  if (invoiceDate && inPeriod(invoiceDate, from, to)) {
    const converted = convertAmount(
      Math.max(0, inv.totalCents ?? 0),
      inv,
      invoiceDate,
      reportingCurrency,
      fxContext,
      dataQuality,
    );
    return converted ?? 0;
  }
  return 0;
}

/** Compute separated revenue, cashflow, and contribution metrics for a reporting period. */
export function computeRevenueCashflowContribution(
  input: ComputeRevenueCashflowInput,
): RevenueCashflowContributionResult {
  const reportingCurrency = (
    input.fxContext?.reportingCurrency ??
    input.reportingCurrency ??
    'EUR'
  ).toUpperCase();
  const reportingCurrencySource =
    input.fxContext?.reportingCurrencySource ?? 'platform_default';
  const timezone = input.timezone ?? 'Europe/Berlin';
  const from = input.periodStart;
  const to = input.periodEndInclusive;
  const fxContext = input.fxContext;

  const metrics = {
    invoicedRevenue: emptyBucket(reportingCurrency),
    periodRevenue: emptyBucket(reportingCurrency),
    paymentReceipts: emptyBucket(reportingCurrency),
    refunds: emptyBucket(reportingCurrency),
    operatingExpenses: emptyBucket(reportingCurrency),
    netCashflow: emptyBucket(reportingCurrency),
    directVariableCosts: emptyBucket(reportingCurrency),
    contributionMargin: emptyBucket(reportingCurrency),
    operatingResult: null as FinanceMoneyBucket | null,
  };

  const dataQuality = {
    missingPaidAtCount: 0,
    missingSubtotalCount: 0,
    incompatibleCurrencyCount: 0,
    priorMonthInvoicePaidInPeriodCount: 0,
    missingExpenseSource: false,
  };

  const multiCurrencyQuality = emptyMultiCurrencyDataQuality(
    reportingCurrency,
    reportingCurrencySource,
  );

  let invoicedNetForPeriod = 0;
  let adjustmentsNetInPeriod = 0;
  let paymentGross = 0;
  let refundGross = 0;
  let expenseCashOut = 0;
  let variableNet = 0;
  let hasIncomingInvoices = false;

  for (const inv of input.invoices) {
    const status = normalizeInvoiceStatus(inv.status);
    const invoiceDate = effectiveInvoiceDate(inv);
    const { netMinor, taxMinor, grossMinor } = resolveNetTaxTotal(inv);

    if (inv.subtotalCents == null && inv.taxCents == null && grossMinor > 0) {
      dataQuality.missingSubtotalCount += 1;
    }

    if (isRevenueInvoice(inv) && invoiceDate && inPeriod(invoiceDate, from, to)) {
      const converted = convertTriple(
        inv,
        invoiceDate,
        reportingCurrency,
        fxContext,
        multiCurrencyQuality,
      );
      if (converted) {
        addToBucket(metrics.invoicedRevenue, converted.net, converted.tax, converted.gross);
        invoicedNetForPeriod += converted.net;
      }
    }

    if (isOutgoingInvoiceType(inv.type) && PERIOD_ADJUSTMENT_STATUSES.has(status)) {
      const adjDate = adjustmentDate(inv);
      if (adjDate && inPeriod(adjDate, from, to)) {
        const convertedNet = convertAmount(
          netMinor,
          inv,
          adjDate,
          reportingCurrency,
          fxContext,
          multiCurrencyQuality,
        );
        if (convertedNet != null) {
          adjustmentsNetInPeriod += convertedNet;
          if (REFUND_STATUSES.has(status)) {
            const converted = convertTriple(
              inv,
              adjDate,
              reportingCurrency,
              fxContext,
              multiCurrencyQuality,
            );
            if (converted) {
              addToBucket(metrics.refunds, converted.net, converted.tax, converted.gross);
              refundGross += converted.gross;
            }
          }
        }
      }
    }

    if (isRevenueInvoice(inv) || isOutgoingInvoiceType(inv.type)) {
      const paidAmount = paymentAmountInPeriod(
        inv,
        from,
        to,
        reportingCurrency,
        fxContext,
        multiCurrencyQuality,
      );
      if (paidAmount > 0) {
        const invoiceDateForPayment = effectiveInvoiceDate(inv);
        addToBucket(metrics.paymentReceipts, paidAmount, 0, paidAmount);
        paymentGross += paidAmount;
        if (invoiceDateForPayment && invoiceDateForPayment < from) {
          dataQuality.priorMonthInvoicePaidInPeriodCount += 1;
        }
      } else if (normalizeInvoiceStatus(inv.status) === 'PAID' && !inv.paidAt) {
        dataQuality.missingPaidAtCount += 1;
      }
    }

    if (isExpenseInvoice(inv)) {
      hasIncomingInvoices = true;
      const invoiceDateForExpense = effectiveInvoiceDate(inv);
      if (invoiceDateForExpense && inPeriod(invoiceDateForExpense, from, to)) {
        const converted = convertTriple(
          inv,
          invoiceDateForExpense,
          reportingCurrency,
          fxContext,
          multiCurrencyQuality,
        );
        if (converted) {
          addToBucket(metrics.operatingExpenses, converted.net, converted.tax, converted.gross);
        }
      }
      const cashOut = expenseCashOutInPeriod(
        inv,
        from,
        to,
        reportingCurrency,
        fxContext,
        multiCurrencyQuality,
      );
      if (cashOut > 0) expenseCashOut += cashOut;

      if (isVariableCostInvoice(inv) && invoiceDateForExpense && inPeriod(invoiceDateForExpense, from, to)) {
        const converted = convertTriple(
          inv,
          invoiceDateForExpense,
          reportingCurrency,
          fxContext,
          multiCurrencyQuality,
        );
        if (converted) {
          addToBucket(metrics.directVariableCosts, converted.net, converted.tax, converted.gross);
          variableNet += converted.net;
        }
      }
    }
  }

  dataQuality.incompatibleCurrencyCount = multiCurrencyQuality.excludedCount;

  const periodNet = Math.max(0, invoicedNetForPeriod - adjustmentsNetInPeriod);
  metrics.periodRevenue = {
    ...emptyBucket(reportingCurrency),
    netAmountMinor: periodNet,
    taxAmountMinor: metrics.invoicedRevenue.taxAmountMinor,
    amountMinor: periodNet + metrics.invoicedRevenue.taxAmountMinor,
    invoiceCount: metrics.invoicedRevenue.invoiceCount,
  };

  const netCashflowMinor = paymentGross - expenseCashOut - refundGross;
  metrics.netCashflow = {
    ...emptyBucket(reportingCurrency),
    amountMinor: netCashflowMinor,
    netAmountMinor: netCashflowMinor,
    taxAmountMinor: 0,
    invoiceCount: metrics.paymentReceipts.invoiceCount,
  };

  const contributionNet = periodNet - variableNet;
  metrics.contributionMargin = {
    ...emptyBucket(reportingCurrency),
    netAmountMinor: contributionNet,
    amountMinor: contributionNet,
    taxAmountMinor: 0,
    invoiceCount: metrics.periodRevenue.invoiceCount,
  };

  const reasons: string[] = [];
  let costBasis: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' = 'COMPLETE';
  const variableCostBasis: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' = 'PARTIAL';

  if (metrics.directVariableCosts.invoiceCount === 0) {
    reasons.push('variable_cost_classification_missing');
  }

  if (!hasIncomingInvoices && metrics.invoicedRevenue.invoiceCount > 0) {
    costBasis = 'PARTIAL';
    dataQuality.missingExpenseSource = true;
    reasons.push('no_incoming_expense_invoices_observed');
  }

  if (dataQuality.missingSubtotalCount > 0) {
    costBasis = 'PARTIAL';
    reasons.push('tax_net_split_incomplete');
  }

  const multiCurrency = buildMultiCurrencyMeta(multiCurrencyQuality, input.invoices.length);
  if (multiCurrency.completeness === 'PARTIAL' || multiCurrency.completeness === 'UNAVAILABLE') {
    costBasis = 'PARTIAL';
    reasons.push(...multiCurrency.completenessReasons);
  }

  const operatingResultVisible = costBasis === 'COMPLETE';
  if (operatingResultVisible) {
    const opNet = periodNet - metrics.operatingExpenses.netAmountMinor;
    metrics.operatingResult = {
      ...emptyBucket(reportingCurrency),
      netAmountMinor: opNet,
      amountMinor: opNet,
      taxAmountMinor: 0,
      invoiceCount: 1,
    };
  } else {
    reasons.push('operating_result_hidden_incomplete_cost_basis');
  }

  reasons.push('contribution_margin_partial_no_variable_cost_model');

  return {
    reportingCurrency,
    timezone,
    periodStart: from.toISOString(),
    periodEndInclusive: to.toISOString(),
    accrualPolicy: 'invoice_date_net_with_period_adjustments',
    metrics,
    completeness: {
      costBasis,
      variableCostBasis,
      operatingResultVisible,
      reasons,
    },
    dataQuality,
    multiCurrency,
  };
}

export function netCashflowMinor(result: RevenueCashflowContributionResult): number {
  return result.metrics.netCashflow.amountMinor;
}
