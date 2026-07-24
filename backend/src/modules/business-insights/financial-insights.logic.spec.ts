/**
 * Mirrors frontend `financial-insights.logic.ts` rules — keep in sync when
 * changing receivable / revenue bucketing on the Insights page.
 */
import {
  expensesInRange,
  issuedRevenueInRange,
  mtdRevenueInRange,
  openOutgoingReceivables,
  overdueOutgoingReceivables,
  paidRevenueInRange,
  preIssuedBookingRevenueInRange,
  reservedRevenueInRange,
  sumCents,
} from '../../../../frontend/src/rental/lib/financial-insights.logic';

const inv = (
  overrides: Partial<{
    id: string;
    type: string;
    status: string;
    totalCents: number;
    invoiceDate: string;
    dueDate: string | null;
    paidAt: string | null;
    createdAt: string;
    currency: string;
    bookingId: string | null;
  }> = {},
) => ({
  id: overrides.id ?? 'i1',
  type: overrides.type ?? 'OUTGOING_BOOKING',
  status: overrides.status ?? 'SENT',
  totalCents: overrides.totalCents ?? 10_000,
  currency: overrides.currency ?? 'EUR',
  invoiceDate: overrides.invoiceDate ?? '2026-06-10',
  dueDate: overrides.dueDate ?? '2026-06-20',
  paidAt: overrides.paidAt ?? null,
  createdAt: overrides.createdAt ?? '2026-06-10',
  bookingId: overrides.bookingId ?? null,
});

describe('financial-insights.logic (Insights cockpit)', () => {
  const now = new Date('2026-06-16T12:00:00.000Z');
  const monthStart = new Date('2026-06-01T00:00:00.000Z');

  it('open receivables include old unpaid invoices outside current month', () => {
    const rows = [
      inv({ id: 'old', invoiceDate: '2025-12-01', dueDate: '2026-07-01', status: 'SENT' }),
      inv({ id: 'mtd', invoiceDate: '2026-06-05', status: 'SENT' }),
      inv({ id: 'paid', status: 'PAID', paidAt: '2026-06-08' }),
    ];
    const open = openOutgoingReceivables(rows, now);
    expect(open.map((r) => r.id).sort()).toEqual(['mtd', 'old']);
  });

  it('overdue filters by dueDate in org timezone', () => {
    const rows = [
      inv({ id: 'over', dueDate: '2026-06-01', status: 'SENT' }),
      inv({ id: 'ok', dueDate: '2026-06-30', status: 'SENT' }),
    ];
    expect(overdueOutgoingReceivables(rows, now, 'Europe/Berlin').map((r) => r.id)).toEqual(['over']);
  });

  it('issued revenue MTD excludes draft and cancelled', () => {
    const rows = [
      inv({ id: 'issued', invoiceDate: '2026-06-08' }),
      inv({ id: 'draft', status: 'DRAFT', invoiceDate: '2026-06-08' }),
      inv({ id: 'cancel', status: 'CANCELLED', invoiceDate: '2026-06-08' }),
      inv({ id: 'prev', invoiceDate: '2026-05-28' }),
    ];
    const mtd = issuedRevenueInRange(rows, monthStart, now);
    expect(mtd.map((r) => r.id)).toEqual(['issued']);
  });

  it('paid revenue uses paidAt not invoiceDate', () => {
    const rows = [
      inv({
        id: 'paid-mtd',
        status: 'PAID',
        invoiceDate: '2026-05-01',
        paidAt: '2026-06-12',
      }),
      inv({
        id: 'paid-prev',
        status: 'PAID',
        invoiceDate: '2026-06-01',
        paidAt: '2026-05-20',
      }),
    ];
    const mtdPaid = paidRevenueInRange(rows, monthStart, now);
    expect(mtdPaid.map((r) => r.id)).toEqual(['paid-mtd']);
  });

  it('expenses exclude draft and cancelled incoming', () => {
    const rows = [
      inv({ id: 'exp', type: 'INCOMING_VENDOR', invoiceDate: '2026-06-03' }),
      inv({ id: 'draft', type: 'INCOMING_VENDOR', status: 'DRAFT', invoiceDate: '2026-06-03' }),
    ];
    const exp = expensesInRange(rows, monthStart, now);
    expect(exp.map((r) => r.id)).toEqual(['exp']);
  });

  it('sumCents aggregates totals', () => {
    const rows = [inv({ totalCents: 1500 }), inv({ totalCents: 2500 })];
    expect(sumCents(rows)).toBe(4000);
  });

  it('preIssuedBookingRevenueInRange includes draft booking invoices in month', () => {
    const rows = [
      inv({ id: 'draft-booking', status: 'DRAFT', invoiceDate: '2026-06-08', totalCents: 12_000 }),
      inv({ id: 'draft-manual', type: 'OUTGOING_MANUAL', status: 'DRAFT', invoiceDate: '2026-06-08' }),
      inv({ id: 'old-draft', status: 'DRAFT', invoiceDate: '2026-05-01' }),
    ];
    expect(preIssuedBookingRevenueInRange(rows, monthStart, now).map((r) => r.id)).toEqual(['draft-booking']);
  });

  it('mtdRevenueInRange dedupes issued and paid only (Option A — no drafts)', () => {
    const rows = [
      inv({ id: 'issued', invoiceDate: '2026-06-08', totalCents: 5_000 }),
      inv({
        id: 'paid',
        status: 'PAID',
        invoiceDate: '2026-05-01',
        paidAt: '2026-06-10',
        totalCents: 7_000,
      }),
      inv({ id: 'draft-booking', status: 'DRAFT', invoiceDate: '2026-06-12', totalCents: 3_000 }),
    ];
    expect(mtdRevenueInRange(rows, monthStart, now).map((r) => r.id).sort()).toEqual([
      'issued',
      'paid',
    ]);
  });

  it('reservedRevenueInRange dedupes draft booking invoices per bookingId', () => {
    const rows = [
      inv({
        id: 'draft-a',
        status: 'DRAFT',
        invoiceDate: '2026-06-08',
        totalCents: 12_000,
        createdAt: '2026-06-08',
        bookingId: 'b1',
      }),
      inv({
        id: 'draft-b',
        status: 'DRAFT',
        invoiceDate: '2026-06-09',
        totalCents: 12_000,
        createdAt: '2026-06-09',
        bookingId: 'b1',
      }),
      inv({ id: 'issued', invoiceDate: '2026-06-08' }),
    ];
    expect(reservedRevenueInRange(rows, monthStart, now).map((r) => r.id)).toEqual(['draft-b']);
  });
});
