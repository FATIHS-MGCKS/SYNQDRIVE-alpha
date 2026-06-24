import type { DashboardInvoice } from '../dashboardTypes';
import type {
  BusinessDocumentState,
  BusinessMetricId,
  BusinessPulseRow,
  BusinessPulseSlice,
} from './dashboardRuntimeTypes';

const OUTGOING_INVOICE_TYPES = new Set(['OUTGOING_BOOKING', 'OUTGOING_MANUAL']);
const INCOMING_INVOICE_TYPES = new Set(['INCOMING_VENDOR', 'INCOMING_UPLOADED']);

export interface BuildBusinessPulseSlicesInput {
  invoices: DashboardInvoice[];
  locale: string;
  now?: Date;
  currency?: string;
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

function isOutgoingInvoice(inv: DashboardInvoice): boolean {
  return OUTGOING_INVOICE_TYPES.has(inv.type);
}

function isIncomingInvoice(inv: DashboardInvoice): boolean {
  return INCOMING_INVOICE_TYPES.has(inv.type);
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

function rowTitle(inv: DashboardInvoice, locale: string): string {
  const typeLabel = inv.type.replace(/_/g, ' ').toLowerCase();
  return inv.id ? `${typeLabel} · ${inv.id.slice(0, 8)}` : label(locale, 'Rechnung', 'Invoice');
}

function rowSubtitle(inv: DashboardInvoice): string | undefined {
  return [inv.status, inv.invoiceDate || inv.createdAt].filter(Boolean).join(' · ') || undefined;
}

function invoiceRow(inv: DashboardInvoice, locale: string, now: Date, fallbackCurrency: string): BusinessPulseRow {
  const state = deriveBusinessDocumentState(inv, now);
  const currency = (inv.currency || fallbackCurrency || 'EUR').toUpperCase();
  return {
    id: `invoice:${inv.id}`,
    invoiceId: inv.id,
    ...(inv.customerId ? { customerId: inv.customerId } : {}),
    ...(inv.vehicleId ? { vehicleId: inv.vehicleId } : {}),
    title: rowTitle(inv, locale),
    ...(rowSubtitle(inv) ? { subtitle: rowSubtitle(inv) } : {}),
    ...(typeof inv.totalCents === 'number' ? { amountCents: inv.totalCents } : {}),
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
}): BusinessPulseSlice {
  const rows = sortRows(input.rows);
  return {
    id: input.id,
    title: input.title,
    valueCents: input.valueCents ?? sumCents(rows),
    count: rows.length,
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

export function buildBusinessPulseSlices(
  input: BuildBusinessPulseSlicesInput,
): Record<BusinessMetricId, BusinessPulseSlice> {
  const now = input.now ?? new Date();
  const currency = input.currency ?? 'EUR';
  const rows = input.invoices.map((inv) => invoiceRow(inv, input.locale, now, currency));
  const rowByInvoiceId = new Map(rows.map((row) => [row.invoiceId, row]));

  const outgoingRows = input.invoices
    .filter(isOutgoingInvoice)
    .map((inv) => rowByInvoiceId.get(inv.id))
    .filter((row): row is BusinessPulseRow => !!row)
    .filter((row) => row.state !== 'draft' && row.state !== 'refunded');
  const incomingRows = input.invoices
    .filter(isIncomingInvoice)
    .map((inv) => rowByInvoiceId.get(inv.id))
    .filter((row): row is BusinessPulseRow => !!row)
    .filter((row) => row.state !== 'draft' && row.state !== 'refunded');
  const openReceivables = outgoingRows.filter((row) => row.state === 'open');
  const overdueReceivables = outgoingRows.filter((row) => row.state === 'overdue');
  const paidInvoices = outgoingRows.filter((row) => row.state === 'paid');
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
    }),
    profit: makeSlice({
      id: 'profit',
      title: label(input.locale, 'Ergebnis', 'Profit'),
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
      tone: profitCents >= 0 ? 'success' : 'critical',
      hint: label(input.locale, 'Umsatz minus Ausgaben', 'Revenue minus expenses'),
    }),
    expenses: makeSlice({
      id: 'expenses',
      title: label(input.locale, 'Ausgaben', 'Expenses'),
      rows: incomingRows,
      locale: input.locale,
      valueCents: expensesCents,
      tone: expensesCents > 0 ? 'watch' : 'neutral',
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
      title: label(input.locale, 'Überfällige Forderungen', 'Overdue receivables'),
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
  };
}
