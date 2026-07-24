import { moneyFromMinor, sumMoney } from '@synq/money/money.util';
import type {
  ReceivableInvoiceRow,
  ReceivablesAgingBucket,
  ReceivablesAnalyticsResult,
  ReceivablesMoneyBucket,
} from './receivables-invoice.contract';
import { daysOverdueInTimezone, zonedDateOnly } from './receivables-zoned-due';

export const OUTGOING_INVOICE_TYPES = new Set([
  'OUTGOING_BOOKING',
  'OUTGOING_MANUAL',
  'OUTGOING_FINAL',
]);

const CANCELLED_STATUSES = new Set(['CANCELLED', 'CANCELED', 'VOID']);
const CREDIT_STATUSES = new Set(['CREDITED']);
const REFUND_STATUSES = new Set(['REFUNDED', 'PARTIALLY_REFUNDED']);
const DISPUTED_STATUSES = new Set(['DISPUTED', 'CHARGEBACK']);
const UNCOLLECTIBLE_STATUSES = new Set(['UNCOLLECTIBLE', 'WRITTEN_OFF']);
const DEFERRED_STATUSES = new Set(['DEFERRED', 'PAYMENT_DEFERRED']);
const NON_OPEN_OUTGOING_STATUSES = new Set(['DRAFT', 'CANCELLED', 'CANCELED', 'VOID', 'CREDITED']);

export function normalizeInvoiceStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toUpperCase();
}

export function isOutgoingInvoiceType(type: string): boolean {
  return OUTGOING_INVOICE_TYPES.has(type);
}

export function parseInvoiceInstant(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Open receivable balance in minor units — never negative; overpayments clamp to 0. */
export function resolveOutstandingMinor(inv: ReceivableInvoiceRow): number {
  if (typeof inv.outstandingCents === 'number' && Number.isFinite(inv.outstandingCents)) {
    return Math.max(0, Math.trunc(inv.outstandingCents));
  }
  const total = Math.max(0, inv.totalCents ?? 0);
  const paid = Math.max(0, inv.paidCents ?? 0);
  if (paid > 0) return Math.max(0, total - paid);
  return total;
}

export function isPaidInvoice(inv: ReceivableInvoiceRow): boolean {
  const status = normalizeInvoiceStatus(inv.status);
  if (status === 'PAID' || inv.paidAt) return true;
  const outstanding = resolveOutstandingMinor(inv);
  const total = inv.totalCents ?? 0;
  return total > 0 && outstanding <= 0;
}

export function isOpenReceivableInvoice(inv: ReceivableInvoiceRow): boolean {
  if (!isOutgoingInvoiceType(inv.type)) return false;
  const status = normalizeInvoiceStatus(inv.status);
  if (NON_OPEN_OUTGOING_STATUSES.has(status)) return false;
  if (UNCOLLECTIBLE_STATUSES.has(status)) return false;
  if (isPaidInvoice(inv)) return false;
  return resolveOutstandingMinor(inv) > 0;
}

function emptyBucket(currency: string): ReceivablesMoneyBucket {
  return { amountMinor: 0, invoiceCount: 0, currency };
}

function addToBucket(bucket: ReceivablesMoneyBucket, amountMinor: number): void {
  bucket.amountMinor += amountMinor;
  bucket.invoiceCount += 1;
}

function resolveAgingBucket(
  daysOverdue: number | null,
  hasDueDate: boolean,
): ReceivablesAgingBucket {
  if (!hasDueDate || daysOverdue == null) return 'not_due';
  if (daysOverdue <= 0) return 'not_due';
  if (daysOverdue <= 7) return 'overdue_1_7';
  if (daysOverdue <= 30) return 'overdue_8_30';
  if (daysOverdue <= 60) return 'overdue_31_60';
  if (daysOverdue <= 90) return 'overdue_61_90';
  return 'overdue_90_plus';
}

export interface ComputeReceivablesAnalyticsInput {
  invoices: ReceivableInvoiceRow[];
  reference?: Date;
  timezone?: string;
  reportingCurrency?: string;
}

/**
 * Compute receivables KPIs and aging buckets for Auswertungen.
 * Sums only invoices matching `reportingCurrency` (default EUR).
 */
export function computeReceivablesAnalytics(
  input: ComputeReceivablesAnalyticsInput,
): ReceivablesAnalyticsResult {
  const reference = input.reference ?? new Date();
  const timezone = input.timezone ?? 'Europe/Berlin';
  const reportingCurrency = (input.reportingCurrency ?? 'EUR').toUpperCase();

  const metrics = {
    openTotal: emptyBucket(reportingCurrency),
    openNotDue: emptyBucket(reportingCurrency),
    overdue: emptyBucket(reportingCurrency),
    partiallyPaid: emptyBucket(reportingCurrency),
    disputed: emptyBucket(reportingCurrency),
    deferred: emptyBucket(reportingCurrency),
    uncollectible: emptyBucket(reportingCurrency),
    cancelled: emptyBucket(reportingCurrency),
    credits: emptyBucket(reportingCurrency),
    refunds: emptyBucket(reportingCurrency),
  };

  const aging: Record<ReceivablesAgingBucket, ReceivablesMoneyBucket> = {
    not_due: emptyBucket(reportingCurrency),
    overdue_1_7: emptyBucket(reportingCurrency),
    overdue_8_30: emptyBucket(reportingCurrency),
    overdue_31_60: emptyBucket(reportingCurrency),
    overdue_61_90: emptyBucket(reportingCurrency),
    overdue_90_plus: emptyBucket(reportingCurrency),
  };

  const dataQuality = {
    missingDueDateCount: 0,
    missingDueDateOutstandingMinor: 0,
    incompatibleCurrencyCount: 0,
    overpaidCount: 0,
    overpaidTotalMinor: 0,
  };

  for (const inv of input.invoices) {
    const currency = (inv.currency ?? 'EUR').toUpperCase();
    if (currency !== reportingCurrency && currency !== '€') {
      dataQuality.incompatibleCurrencyCount += 1;
      continue;
    }

    const status = normalizeInvoiceStatus(inv.status);
    const outstanding = resolveOutstandingMinor(inv);
    const total = inv.totalCents ?? 0;
    const paid = inv.paidCents ?? 0;

    if (paid > total && total > 0) {
      dataQuality.overpaidCount += 1;
      dataQuality.overpaidTotalMinor += paid - total;
    }

    if (CANCELLED_STATUSES.has(status)) {
      addToBucket(metrics.cancelled, Math.abs(total));
      continue;
    }

    if (CREDIT_STATUSES.has(status) || (isOutgoingInvoiceType(inv.type) && total < 0)) {
      addToBucket(metrics.credits, Math.abs(total));
      continue;
    }

    if (REFUND_STATUSES.has(status)) {
      addToBucket(metrics.refunds, Math.abs(total > 0 ? total : paid));
      continue;
    }

    if (UNCOLLECTIBLE_STATUSES.has(status)) {
      addToBucket(metrics.uncollectible, outstanding > 0 ? outstanding : Math.abs(total));
      continue;
    }

    if (!isOutgoingInvoiceType(inv.type)) continue;

    if (DISPUTED_STATUSES.has(status) && outstanding > 0) {
      addToBucket(metrics.disputed, outstanding);
    }

    if (DEFERRED_STATUSES.has(status) && outstanding > 0) {
      addToBucket(metrics.deferred, outstanding);
    }

    if (!isOpenReceivableInvoice(inv)) continue;

    addToBucket(metrics.openTotal, outstanding);

    if (paid > 0 && outstanding > 0) {
      addToBucket(metrics.partiallyPaid, outstanding);
    }

    const due = parseInvoiceInstant(inv.dueDate);
    if (!due) {
      dataQuality.missingDueDateCount += 1;
      dataQuality.missingDueDateOutstandingMinor += outstanding;
      aging.not_due.amountMinor += outstanding;
      aging.not_due.invoiceCount += 1;
      continue;
    }

    const daysOverdue = daysOverdueInTimezone(due, reference, timezone);
    if (daysOverdue != null && daysOverdue > 0) {
      addToBucket(metrics.overdue, outstanding);
    } else {
      addToBucket(metrics.openNotDue, outstanding);
    }

    const agingBucket = resolveAgingBucket(daysOverdue, true);
    addToBucket(aging[agingBucket], outstanding);
  }

  return {
    timezone,
    reportingCurrency,
    referenceInstant: reference.toISOString(),
    metrics,
    aging,
    dataQuality,
  };
}

/** Sum outstanding minor for open receivable invoice rows (legacy helper). */
export function sumOutstandingMinor(
  rows: ReceivableInvoiceRow[],
  currency = 'EUR',
): number {
  const amounts = rows
    .filter((row) => isOpenReceivableInvoice(row))
    .map((row) => moneyFromMinor(resolveOutstandingMinor(row), row.currency ?? currency));
  if (amounts.length === 0) return 0;
  return sumMoney(amounts, currency).amountMinor;
}

export function filterOpenNotDueReceivables(
  invoices: ReceivableInvoiceRow[],
  reference: Date,
  timezone: string,
  reportingCurrency = 'EUR',
): ReceivableInvoiceRow[] {
  return invoices.filter((inv) => {
    if ((inv.currency ?? 'EUR').toUpperCase() !== reportingCurrency) return false;
    if (!isOpenReceivableInvoice(inv)) return false;
    const due = parseInvoiceInstant(inv.dueDate);
    if (!due) return false;
    const days = daysOverdueInTimezone(due, reference, timezone);
    return days != null && days <= 0;
  });
}

export function filterOverdueReceivables(
  invoices: ReceivableInvoiceRow[],
  reference: Date,
  timezone: string,
  reportingCurrency = 'EUR',
): ReceivableInvoiceRow[] {
  return invoices.filter((inv) => {
    if ((inv.currency ?? 'EUR').toUpperCase() !== reportingCurrency) return false;
    if (!isOpenReceivableInvoice(inv)) return false;
    const due = parseInvoiceInstant(inv.dueDate);
    if (!due) return false;
    return daysOverdueInTimezone(due, reference, timezone)! > 0;
  });
}

export function filterOpenReceivables(
  invoices: ReceivableInvoiceRow[],
  reportingCurrency = 'EUR',
): ReceivableInvoiceRow[] {
  return invoices.filter((inv) => {
    if ((inv.currency ?? 'EUR').toUpperCase() !== reportingCurrency) return false;
    return isOpenReceivableInvoice(inv);
  });
}
