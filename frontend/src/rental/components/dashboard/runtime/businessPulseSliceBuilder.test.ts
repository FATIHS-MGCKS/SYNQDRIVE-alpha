import { describe, expect, it } from 'vitest';
import type { DashboardInvoice } from '../dashboardTypes';
import { buildBusinessPulseSlices } from './businessPulseSliceBuilder';

const NOW = new Date('2026-06-24T10:00:00.000Z');

function invoice(overrides: Partial<DashboardInvoice> = {}): DashboardInvoice {
  return {
    id: overrides.id ?? 'inv-1',
    type: overrides.type ?? 'OUTGOING_BOOKING',
    status: overrides.status ?? 'ISSUED',
    totalCents: overrides.totalCents ?? 10_000,
    currency: overrides.currency ?? 'EUR',
    invoiceDate: overrides.invoiceDate ?? '2026-06-20T00:00:00.000Z',
    dueDate: overrides.dueDate ?? '2026-07-01T00:00:00.000Z',
    createdAt: overrides.createdAt ?? '2026-06-20T00:00:00.000Z',
    paidAt: overrides.paidAt ?? null,
    customerId: overrides.customerId ?? null,
    vehicleId: overrides.vehicleId ?? null,
  };
}

describe('buildBusinessPulseSlices invoice classification', () => {
  it('includes OUTGOING_FINAL in revenue', () => {
    const slices = buildBusinessPulseSlices({
      locale: 'en',
      now: NOW,
      invoices: [
        invoice({ id: 'booking', type: 'OUTGOING_BOOKING', totalCents: 10_000 }),
        invoice({ id: 'manual', type: 'OUTGOING_MANUAL', totalCents: 5_000 }),
        invoice({ id: 'final', type: 'OUTGOING_FINAL', totalCents: 7_500 }),
      ],
    });

    expect(slices.revenue.count).toBe(3);
    expect(slices.revenue.valueCents).toBe(22_500);
    expect(slices.revenue.rows.map((row) => row.invoiceId).sort()).toEqual(['booking', 'final', 'manual']);
  });

  it('counts only incoming vendor/uploaded invoices as expenses', () => {
    const slices = buildBusinessPulseSlices({
      locale: 'en',
      now: NOW,
      invoices: [
        invoice({ id: 'vendor', type: 'INCOMING_VENDOR', totalCents: 4_000 }),
        invoice({ id: 'uploaded', type: 'INCOMING_UPLOADED', totalCents: 2_500 }),
        invoice({ id: 'outgoing', type: 'OUTGOING_BOOKING', totalCents: 9_000 }),
        invoice({ id: 'rejected', type: 'INCOMING_VENDOR', status: 'REJECTED', totalCents: 1_000 }),
      ],
    });

    expect(slices.expenses.count).toBe(2);
    expect(slices.expenses.valueCents).toBe(6_500);
    expect(slices.expenses.rows.map((row) => row.invoiceId).sort()).toEqual(['uploaded', 'vendor']);
  });

  it('tracks open and overdue outgoing receivables separately', () => {
    const slices = buildBusinessPulseSlices({
      locale: 'en',
      now: NOW,
      invoices: [
        invoice({
          id: 'open',
          type: 'OUTGOING_MANUAL',
          status: 'ISSUED',
          dueDate: '2026-07-10T00:00:00.000Z',
          totalCents: 3_000,
        }),
        invoice({
          id: 'overdue',
          type: 'OUTGOING_FINAL',
          status: 'ISSUED',
          dueDate: '2026-06-01T00:00:00.000Z',
          totalCents: 5_000,
        }),
        invoice({
          id: 'paid',
          type: 'OUTGOING_BOOKING',
          status: 'PAID',
          paidAt: '2026-06-10T00:00:00.000Z',
          totalCents: 8_000,
        }),
        invoice({
          id: 'incoming-open',
          type: 'INCOMING_VENDOR',
          status: 'ISSUED',
          dueDate: '2026-06-01T00:00:00.000Z',
          totalCents: 1_500,
        }),
      ],
    });

    expect(slices['open-receivables'].count).toBe(1);
    expect(slices['open-receivables'].rows[0]?.invoiceId).toBe('open');
    expect(slices['overdue-receivables'].count).toBe(1);
    expect(slices['overdue-receivables'].rows[0]?.invoiceId).toBe('overdue');
  });

  it('computes profit as revenue minus expenses without invoice document count', () => {
    const slices = buildBusinessPulseSlices({
      locale: 'en',
      now: NOW,
      invoices: [
        invoice({ id: 'rev-a', type: 'OUTGOING_BOOKING', totalCents: 20_000 }),
        invoice({ id: 'rev-b', type: 'OUTGOING_FINAL', totalCents: 5_000 }),
        invoice({ id: 'exp-a', type: 'INCOMING_VENDOR', totalCents: 7_000 }),
      ],
    });

    expect(slices.profit.valueCents).toBe(18_000);
    expect(slices.profit.count).toBeNull();
    expect(slices.profit.hint).toBe('Revenue minus expenses');
  });

  it('aligns revenue total with outgoing invoice sum used by invoice stats semantics', () => {
    const slices = buildBusinessPulseSlices({
      locale: 'en',
      now: NOW,
      invoices: [
        invoice({ id: 'final', type: 'OUTGOING_FINAL', totalCents: 12_000 }),
        invoice({ id: 'void', type: 'OUTGOING_MANUAL', status: 'VOID', totalCents: 99_000 }),
        invoice({ id: 'cancelled-exp', type: 'INCOMING_VENDOR', status: 'CANCELLED', totalCents: 99_000 }),
      ],
    });

    expect(slices.revenue.valueCents).toBe(12_000);
    expect(slices.expenses.valueCents).toBe(0);
  });
});
