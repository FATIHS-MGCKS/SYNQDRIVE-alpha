import type { DashboardInvoice } from '../dashboardTypes';
import { bookingRef } from '../../bookings/bookingUtils';
import {
  expensesInRange,
  mtdRevenueInRange,
  openOutgoingReceivables,
  overdueOutgoingReceivables,
  reservedRevenueInRange,
  type InvoiceSlice,
} from '../../../lib/financial-insights.logic';
import {
  isExpenseInvoice,
  isOverdueReceivable,
  isReceivableInvoice,
  isRevenueInvoice,
  normalizeInvoiceStatus,
} from '../../invoices/invoiceClassification';
import type {
  BusinessDocumentState,
  BusinessMetricId,
  BusinessPulseRow,
  BusinessPulseSlice,
} from './dashboardRuntimeTypes';

export interface BuildBusinessPulseSlicesInput {
  invoices: DashboardInvoice[];
  locale: string;
  now?: Date;
  currency?: string;
  /** Canonical reporting window from server (org/station timezone). */
  reportingPeriod?: { from: Date; to: Date; label: string };
}

function isDe(locale: string): boolean {
  return locale === 'de';
}

function label(locale: string, deText: string, enText: string): string {
  return isDe(locale) ? deText : enText;
}

function normalizeStatus(status: string | undefined): string {
  return (status ?? '').trim().toUpperCase();
}

function parseDateMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function isPaid(status: string, inv: DashboardInvoice): boolean {
  return status === 'PAID' || !!inv.paidAt;
}

function isCancelled(status: string): boolean {
  return status === 'CANCELLED' || status === 'CANCELED' || status === 'VOID';
}

function asInvoiceSlice(inv: DashboardInvoice): InvoiceSlice {
  return {
    id: inv.id,
    type: inv.type,
    status: inv.status ?? '',
    totalCents: inv.totalCents,
    currency: inv.currency ?? 'EUR',
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate ?? null,
    paidAt: inv.paidAt ?? null,
    createdAt: inv.createdAt,
    customerId: inv.customerId ?? null,
    vehicleId: inv.vehicleId ?? null,
    bookingId: inv.bookingId ?? null,
  };
}

function invoicesFromSlices(
  invoices: DashboardInvoice[],
  slices: InvoiceSlice[],
): DashboardInvoice[] {
  const byId = new Map(invoices.map((inv) => [inv.id, inv]));
  return slices.map((slice) => byId.get(slice.id)).filter((inv): inv is DashboardInvoice => !!inv);
}

function monthWindow(now: Date): { from: Date; to: Date } {
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
    to: now,
  };
}

/** @deprecated Browser-local month window — pass `reportingPeriod` from server instead. */
function legacyMonthWindow(now: Date): { from: Date; to: Date } {
  return monthWindow(now);
}

function monthLabel(now: Date, locale: string): string {
  return now.toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
    month: 'long',
    year: 'numeric',
  });
}

/** Open receivable balance — outstanding when available, else total minus paid. */
export function receivableAmountCents(inv: DashboardInvoice): number {
  if (typeof inv.outstandingCents === 'number') {
    return Math.max(0, inv.outstandingCents);
  }
  const total = inv.totalCents ?? 0;
  const paid = inv.paidCents ?? 0;
  if (paid > 0) return Math.max(0, total - paid);
  return Math.max(0, total);
}

export function deriveBusinessDocumentState(
  inv: DashboardInvoice,
  now: Date = new Date(),
): BusinessDocumentState {
  const status = normalizeStatus(inv.status);
  if (status === 'PAID' || inv.paidAt) return 'paid';
  if (status === 'DRAFT') return 'draft';
  if (status === 'FAILED' || status === 'PAYMENT_FAILED' || status === 'UNCOLLECTIBLE') return 'failed';
  if (status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED') return 'refunded';
  if (status === 'DISPUTED' || status === 'CHARGEBACK') return 'disputed';
  if (status === 'OVERDUE') return 'overdue';
  if (status === 'OPEN' || status === 'ISSUED' || status === 'SENT' || status === 'PARTIALLY_PAID') {
    const dueMs = parseDateMs(inv.dueDate);
    if (dueMs != null && dueMs < now.getTime()) return 'overdue';
    return 'open';
  }

  const dueMs = parseDateMs(inv.dueDate);
  if (dueMs != null && dueMs < now.getTime() && !isPaid(status, inv)) return 'overdue';
  if (inv.totalCents != null && !isCancelled(status)) return 'open';
  return 'unknown';
}

function rowSeverity(state: BusinessDocumentState): BusinessPulseRow['severity'] {
  if (state === 'paid') return 'success';
  if (state === 'overdue' || state === 'failed' || state === 'disputed') return 'critical';
  if (state === 'open') return 'warning';
  if (state === 'draft') return 'info';
  return 'neutral';
}

function formatShortDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function invoiceStatusLabel(status: string | undefined, locale: string): string {
  const normalized = normalizeInvoiceStatus(status);
  const de = isDe(locale);
  if (normalized === 'PAID') return de ? 'Bezahlt' : 'Paid';
  if (normalized === 'DRAFT') return de ? 'Entwurf' : 'Draft';
  if (normalized === 'OVERDUE') return de ? 'Überfällig' : 'Overdue';
  if (normalized === 'OPEN' || normalized === 'ISSUED' || normalized === 'SENT') {
    return de ? 'Offen' : 'Open';
  }
  if (normalized === 'PARTIALLY_PAID') return de ? 'Teilweise bezahlt' : 'Partially paid';
  if (normalized === 'CANCELLED' || normalized === 'CANCELED' || normalized === 'VOID') {
    return de ? 'Storniert' : 'Void';
  }
  return status?.trim() || (de ? 'Unbekannt' : 'Unknown');
}

function rowTitle(inv: DashboardInvoice, locale: string): string {
  if (inv.invoiceNumberDisplay?.trim()) return inv.invoiceNumberDisplay.trim();
  if (inv.title?.trim()) return inv.title.trim();
  if (inv.bookingId) {
    return label(locale, `Buchung ${bookingRef(inv.bookingId)}`, `Booking ${bookingRef(inv.bookingId)}`);
  }
  return label(locale, 'Rechnung', 'Invoice');
}

function rowSubtitle(inv: DashboardInvoice, locale: string): string | undefined {
  const status = invoiceStatusLabel(inv.status, locale);
  const date = formatShortDate(inv.invoiceDate || inv.createdAt, locale);
  return [status, date].filter(Boolean).join(' · ') || undefined;
}

function invoiceRow(
  inv: DashboardInvoice,
  locale: string,
  now: Date,
  fallbackCurrency: string,
  amountCents?: number,
): BusinessPulseRow {
  const state = deriveBusinessDocumentState(inv, now);
  const currency = (inv.currency || fallbackCurrency || 'EUR').toUpperCase();
  const resolvedAmount =
    amountCents ??
    (isReceivableInvoice(inv) ? receivableAmountCents(inv) : inv.totalCents ?? undefined);

  return {
    id: `invoice:${inv.id}`,
    invoiceId: inv.id,
    ...(inv.bookingId ? { bookingId: inv.bookingId } : {}),
    ...(inv.customerId ? { customerId: inv.customerId } : {}),
    ...(inv.vehicleId ? { vehicleId: inv.vehicleId } : {}),
    title: rowTitle(inv, locale),
    ...(rowSubtitle(inv, locale) ? { subtitle: rowSubtitle(inv, locale) } : {}),
    ...(typeof resolvedAmount === 'number' ? { amountCents: resolvedAmount } : {}),
    currency,
    state,
    dueDate: inv.dueDate ?? null,
    invoiceDate: inv.invoiceDate ?? inv.createdAt ?? null,
    severity: rowSeverity(state),
    primaryActionLabel: label(locale, 'Rechnung öffnen', 'Open invoice'),
    primaryActionTarget: 'open-invoice',
  };
}

function sumCents(rows: BusinessPulseRow[]): number {
  return rows.reduce((sum, row) => sum + (row.amountCents ?? 0), 0);
}

function sortRows(rows: BusinessPulseRow[]): BusinessPulseRow[] {
  return [...rows].sort((a, b) => {
    const aDate = parseDateMs(a.dueDate ?? a.invoiceDate) ?? 0;
    const bDate = parseDateMs(b.dueDate ?? b.invoiceDate) ?? 0;
    if (aDate !== bDate) return aDate - bDate;
    return a.title.localeCompare(b.title);
  });
}

function groupByState(locale: string, rows: BusinessPulseRow[]) {
  const titles: Record<BusinessDocumentState, string> = {
    paid: label(locale, 'Bezahlt', 'Paid'),
    open: label(locale, 'Offen', 'Open'),
    overdue: label(locale, 'Überfällig', 'Overdue'),
    draft: label(locale, 'Entwurf', 'Draft'),
    failed: label(locale, 'Fehlgeschlagen', 'Failed'),
    refunded: label(locale, 'Erstattet', 'Refunded'),
    disputed: label(locale, 'Strittig', 'Disputed'),
    unknown: label(locale, 'Unklar', 'Unknown'),
  };

  return (Object.keys(titles) as BusinessDocumentState[])
    .map((state) => {
      const stateRows = rows.filter((row) => row.state === state);
      return {
        id: state,
        title: titles[state],
        count: stateRows.length,
        rows: stateRows,
      };
    })
    .filter((group) => group.count > 0);
}

function makeSlice(input: {
  id: BusinessMetricId;
  title: string;
  rows: BusinessPulseRow[];
  locale: string;
  tone?: BusinessPulseSlice['tone'];
  valueCents?: number | null;
  hint?: string;
  count?: number | null;
}): BusinessPulseSlice {
  const rows = sortRows(input.rows);
  return {
    id: input.id,
    title: input.title,
    valueCents: input.valueCents ?? sumCents(rows),
    count: input.count !== undefined ? input.count : rows.length,
    ...(input.hint ? { hint: input.hint } : {}),
    tone: input.tone ?? (rows.length > 0 ? 'info' : 'neutral'),
    rows,
    groups: groupByState(input.locale, rows),
  };
}

function summaryRow(input: {
  id: string;
  title: string;
  valueCents: number;
  currency: string;
  state?: BusinessDocumentState;
  severity?: BusinessPulseRow['severity'];
}): BusinessPulseRow {
  return {
    id: input.id,
    title: input.title,
    amountCents: input.valueCents,
    currency: input.currency.toUpperCase(),
    state: input.state ?? 'unknown',
    severity: input.severity ?? 'neutral',
  };
}

function rowsForInvoices(
  invoices: DashboardInvoice[],
  rowByInvoiceId: Map<string | undefined, BusinessPulseRow>,
): BusinessPulseRow[] {
  return invoices
    .map((inv) => rowByInvoiceId.get(inv.id))
    .filter((row): row is BusinessPulseRow => !!row);
}

export function buildBusinessPulseSlices(
  input: BuildBusinessPulseSlicesInput,
): Record<BusinessMetricId, BusinessPulseSlice> {
  const now = input.now ?? new Date();
  const currency = input.currency ?? 'EUR';
  const { from: monthStart, to: monthEnd } = input.reportingPeriod
    ? { from: input.reportingPeriod.from, to: input.reportingPeriod.to }
    : legacyMonthWindow(now);
  const periodLabel = input.reportingPeriod?.label ?? monthLabel(now, input.locale);

  const invoiceSlices = input.invoices.map(asInvoiceSlice);
  const rows = input.invoices.map((inv) => invoiceRow(inv, input.locale, now, currency));
  const rowByInvoiceId = new Map(rows.map((row) => [row.invoiceId, row]));

  const revenueInvoices = mtdRevenueInRange(invoiceSlices, monthStart, monthEnd);
  const reservedInvoices = reservedRevenueInRange(invoiceSlices, monthStart, monthEnd);
  const expenseInvoices = expensesInRange(invoiceSlices, monthStart, monthEnd);
  const outgoingRows = rowsForInvoices(invoicesFromSlices(input.invoices, revenueInvoices), rowByInvoiceId);
  const reservedRows = rowsForInvoices(invoicesFromSlices(input.invoices, reservedInvoices), rowByInvoiceId);
  const incomingRows = rowsForInvoices(invoicesFromSlices(input.invoices, expenseInvoices), rowByInvoiceId);

  const openReceivableInvoices = openOutgoingReceivables(invoiceSlices, now);
  const overdueReceivableInvoices = overdueOutgoingReceivables(invoiceSlices, now);
  const openReceivables = rowsForInvoices(
    invoicesFromSlices(input.invoices, openReceivableInvoices),
    rowByInvoiceId,
  );
  const overdueReceivables = rowsForInvoices(
    invoicesFromSlices(input.invoices, overdueReceivableInvoices),
    rowByInvoiceId,
  );

  const paidInvoices = rows.filter((row) => {
    if (row.state !== 'paid') return false;
    const inv = input.invoices.find((item) => item.id === row.invoiceId);
    return inv ? isRevenueInvoice(inv) : false;
  });
  const draftInvoices = rows.filter((row) => row.state === 'draft');
  const failedPayments = rows.filter((row) => row.state === 'failed' || row.state === 'disputed');

  const revenueCents = sumCents(outgoingRows);
  const expensesCents = sumCents(incomingRows);
  const profitCents = revenueCents - expensesCents;

  return {
    revenue: makeSlice({
      id: 'revenue',
      title: label(input.locale, 'Umsatz', 'Revenue'),
      rows: outgoingRows,
      locale: input.locale,
      valueCents: revenueCents,
      tone: revenueCents > 0 ? 'success' : 'neutral',
      hint: label(input.locale, `${periodLabel} · MTD`, `${periodLabel} · MTD`),
    }),
    profit: makeSlice({
      id: 'profit',
      title: label(input.locale, 'Ergebnis', 'Result'),
      rows: [
        summaryRow({
          id: 'business-summary:revenue',
          title: label(input.locale, 'Umsatz', 'Revenue'),
          valueCents: revenueCents,
          currency,
          state: 'paid',
          severity: 'success',
        }),
        summaryRow({
          id: 'business-summary:expenses',
          title: label(input.locale, 'Ausgaben', 'Expenses'),
          valueCents: expensesCents,
          currency,
          state: 'open',
          severity: 'warning',
        }),
      ],
      locale: input.locale,
      valueCents: profitCents,
      count: null,
      tone: profitCents >= 0 ? 'success' : 'critical',
      hint: periodLabel,
    }),
    expenses: makeSlice({
      id: 'expenses',
      title: label(input.locale, 'Ausgaben', 'Expenses'),
      rows: incomingRows,
      locale: input.locale,
      valueCents: expensesCents,
      tone: expensesCents > 0 ? 'watch' : 'neutral',
      hint: label(input.locale, `${periodLabel} · MTD`, `${periodLabel} · MTD`),
    }),
    'open-receivables': makeSlice({
      id: 'open-receivables',
      title: label(input.locale, 'Offene Forderungen', 'Open receivables'),
      rows: openReceivables,
      locale: input.locale,
      valueCents: sumCents(openReceivables),
      tone: openReceivables.length > 0 ? 'watch' : 'neutral',
    }),
    'overdue-receivables': makeSlice({
      id: 'overdue-receivables',
      title: label(input.locale, 'Überfällig', 'Overdue'),
      rows: overdueReceivables.map((row) => ({ ...row, severity: 'critical' as const })),
      locale: input.locale,
      valueCents: sumCents(overdueReceivables),
      tone: overdueReceivables.length > 0 ? 'critical' : 'success',
    }),
    'paid-invoices': makeSlice({
      id: 'paid-invoices',
      title: label(input.locale, 'Bezahlte Rechnungen', 'Paid invoices'),
      rows: paidInvoices,
      locale: input.locale,
      valueCents: sumCents(paidInvoices),
      tone: paidInvoices.length > 0 ? 'success' : 'neutral',
    }),
    'draft-invoices': makeSlice({
      id: 'draft-invoices',
      title: label(input.locale, 'Rechnungsentwürfe', 'Draft invoices'),
      rows: draftInvoices,
      locale: input.locale,
      valueCents: sumCents(draftInvoices),
      tone: draftInvoices.length > 0 ? 'info' : 'neutral',
    }),
    'failed-payments': makeSlice({
      id: 'failed-payments',
      title: label(input.locale, 'Fehlgeschlagene Zahlungen', 'Failed payments'),
      rows: failedPayments.map((row) => ({ ...row, severity: 'critical' as const })),
      locale: input.locale,
      valueCents: sumCents(failedPayments),
      tone: failedPayments.length > 0 ? 'critical' : 'neutral',
    }),
    'reserved-revenue': makeSlice({
      id: 'reserved-revenue',
      title: label(input.locale, 'Reservierter Umsatz', 'Reserved revenue'),
      rows: reservedRows,
      locale: input.locale,
      valueCents: sumCents(reservedRows),
      tone: reservedRows.length > 0 ? 'info' : 'neutral',
      hint: label(input.locale, `${periodLabel} · Vorauszahlung`, `${periodLabel} · Prepaid`),
    }),
  };
}

// Re-export classification helpers for tests and downstream consumers.
export {
  isOutgoingInvoice,
  isRevenueInvoice,
  isExpenseInvoice,
  isReceivableInvoice,
  isOverdueReceivable,
} from '../../invoices/invoiceClassification';
