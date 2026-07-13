import { describe, expect, it } from 'vitest';
import type { DashboardInvoice } from '../dashboardTypes';
import {
  buildBusinessPulseSlices,
  receivableAmountCents,
} from './businessPulseSliceBuilder';

const NOW = new Date('2026-07-13T10:00:00.000Z');

function invoice(overrides: Partial<DashboardInvoice> = {}): DashboardInvoice {
  return {
    id: overrides.id ?? 'inv-1',
    type: overrides.type ?? 'OUTGOING_BOOKING',
    status: overrides.status ?? 'ISSUED',
    totalCents: overrides.totalCents ?? 10_000,
    paidCents: overrides.paidCents ?? null,
    outstandingCents: overrides.outstandingCents ?? null,
    currency: overrides.currency ?? 'EUR',
    invoiceDate: overrides.invoiceDate ?? '2026-07-10T00:00:00.000Z',
    dueDate: overrides.dueDate ?? '2026-07-20T00:00:00.000Z',
    createdAt: overrides.createdAt ?? '2026-07-10T00:00:00.000Z',
    paidAt: overrides.paidAt ?? null,
    customerId: overrides.customerId ?? null,
    vehicleId: overrides.vehicleId ?? null,
  };
}

describe('buildBusinessPulseSlices invoice classification', () => {
  it('includes OUTGOING_FINAL in MTD revenue only when invoiceDate is in the current month', () => {
    const slices = buildBusinessPulseSlices({
      locale: 'en',
      now: NOW,
      invoices: [
        invoice({ id: 'booking', type: 'OUTGOING_BOOKING', totalCents: 10_000, invoiceDate: '2026-07-05T00:00:00.000Z' }),
        invoice({ id: 'manual', type: 'OUTGOING_MANUAL', totalCents: 5_000, invoiceDate: '2026-07-08T00:00:00.000Z' }),
        invoice({ id: 'final', type: 'OUTGOING_FINAL', totalCents: 7_500, invoiceDate: '2026-07-12T00:00:00.000Z' }),
        invoice({ id: 'old', type: 'OUTGOING_FINAL', totalCents: 99_000, invoiceDate: '2026-05-01T00:00:00.000Z' }),
      ],
    });

    expect(slices.revenue.count).toBe(3);
    expect(slices.revenue.valueCents).toBe(22_500);
    expect(slices.revenue.rows.map((row) => row.invoiceId).sort()).toEqual(['booking', 'final', 'manual']);
  });

  it('excludes drafts from revenue and receivables', () => {
    const slices = buildBusinessPulseSlices({
      locale: 'de',
      now: NOW,
      invoices: [
        invoice({ id: 'draft', status: 'DRAFT', totalCents: 12_000, invoiceDate: '2026-07-10T00:00:00.000Z' }),
        invoice({ id: 'issued', status: 'ISSUED', totalCents: 8_000, invoiceDate: '2026-07-11T00:00:00.000Z' }),
      ],
    });

    expect(slices.revenue.valueCents).toBe(8_000);
    expect(slices['open-receivables'].count).toBe(1);
    expect(slices['draft-invoices'].count).toBe(1);
  });

  it('counts only incoming vendor/uploaded invoices as MTD expenses', () => {
    const slices = buildBusinessPulseSlices({
      locale: 'en',
      now: NOW,
      invoices: [
        invoice({ id: 'vendor', type: 'INCOMING_VENDOR', totalCents: 4_000, invoiceDate: '2026-07-06T00:00:00.000Z' }),
        invoice({ id: 'uploaded', type: 'INCOMING_UPLOADED', totalCents: 2_500, invoiceDate: '2026-07-07T00:00:00.000Z' }),
        invoice({ id: 'outgoing', type: 'OUTGOING_BOOKING', totalCents: 9_000, invoiceDate: '2026-07-08T00:00:00.000Z' }),
        invoice({ id: 'rejected', type: 'INCOMING_VENDOR', status: 'REJECTED', totalCents: 1_000, invoiceDate: '2026-07-08T00:00:00.000Z' }),
        invoice({ id: 'old-exp', type: 'INCOMING_VENDOR', totalCents: 3_000, invoiceDate: '2026-06-01T00:00:00.000Z' }),
      ],
    });

    expect(slices.expenses.count).toBe(2);
    expect(slices.expenses.valueCents).toBe(6_500);
    expect(slices.expenses.rows.map((row) => row.invoiceId).sort()).toEqual(['uploaded', 'vendor']);
  });

  it('tracks open and overdue outgoing receivables separately using outstanding balances', () => {
    const slices = buildBusinessPulseSlices({
      locale: 'en',
      now: NOW,
      invoices: [
        invoice({
          id: 'open',
          type: 'OUTGOING_MANUAL',
          status: 'ISSUED',
          dueDate: '2026-07-20T00:00:00.000Z',
          totalCents: 3_000,
          outstandingCents: 3_000,
          invoiceDate: '2026-06-15T00:00:00.000Z',
        }),
        invoice({
          id: 'overdue',
          type: 'OUTGOING_FINAL',
          status: 'ISSUED',
          dueDate: '2026-07-01T00:00:00.000Z',
          totalCents: 5_000,
          outstandingCents: 5_000,
          invoiceDate: '2026-06-01T00:00:00.000Z',
        }),
        invoice({
          id: 'partial',
          type: 'OUTGOING_BOOKING',
          status: 'PARTIALLY_PAID',
          dueDate: '2026-07-15T00:00:00.000Z',
          totalCents: 10_000,
          paidCents: 4_000,
          outstandingCents: 6_000,
          invoiceDate: '2026-06-10T00:00:00.000Z',
        }),
        invoice({
          id: 'paid',
          type: 'OUTGOING_BOOKING',
          status: 'PAID',
          paidAt: '2026-06-10T00:00:00.000Z',
          totalCents: 8_000,
          outstandingCents: 0,
          invoiceDate: '2026-06-10T00:00:00.000Z',
        }),
      ],
    });

    expect(slices['open-receivables'].count).toBe(2);
    expect(slices['open-receivables'].valueCents).toBe(9_000);
    expect(slices['overdue-receivables'].count).toBe(1);
    expect(slices['overdue-receivables'].valueCents).toBe(5_000);
  });

  it('computes profit as MTD revenue minus MTD expenses', () => {
    const slices = buildBusinessPulseSlices({
      locale: 'en',
      now: NOW,
      invoices: [
        invoice({ id: 'rev-a', type: 'OUTGOING_BOOKING', totalCents: 20_000, invoiceDate: '2026-07-02T00:00:00.000Z' }),
        invoice({ id: 'rev-b', type: 'OUTGOING_FINAL', totalCents: 5_000, invoiceDate: '2026-07-03T00:00:00.000Z' }),
        invoice({ id: 'exp-a', type: 'INCOMING_VENDOR', totalCents: 7_000, invoiceDate: '2026-07-04T00:00:00.000Z' }),
        invoice({ id: 'rev-old', type: 'OUTGOING_FINAL', totalCents: 50_000, invoiceDate: '2026-05-01T00:00:00.000Z' }),
      ],
    });

    expect(slices.profit.valueCents).toBe(18_000);
    expect(slices.profit.count).toBeNull();
    expect(slices.profit.hint).toBe('July 2026');
  });

  it('aligns revenue total with issued outgoing invoices in the active month', () => {
    const slices = buildBusinessPulseSlices({
      locale: 'en',
      now: NOW,
      invoices: [
        invoice({ id: 'final', type: 'OUTGOING_FINAL', totalCents: 12_000, invoiceDate: '2026-07-01T00:00:00.000Z' }),
        invoice({ id: 'void', type: 'OUTGOING_MANUAL', status: 'VOID', totalCents: 99_000, invoiceDate: '2026-07-02T00:00:00.000Z' }),
        invoice({ id: 'cancelled-exp', type: 'INCOMING_VENDOR', status: 'CANCELLED', totalCents: 99_000, invoiceDate: '2026-07-02T00:00:00.000Z' }),
      ],
    });

    expect(slices.revenue.valueCents).toBe(12_000);
    expect(slices.expenses.valueCents).toBe(0);
  });
});

describe('receivableAmountCents', () => {
  it('prefers outstandingCents and falls back to total minus paid', () => {
    expect(receivableAmountCents(invoice({ outstandingCents: 2_500, totalCents: 10_000 }))).toBe(2_500);
    expect(receivableAmountCents(invoice({ totalCents: 10_000, paidCents: 3_000 }))).toBe(7_000);
    expect(receivableAmountCents(invoice({ totalCents: 4_000 }))).toBe(4_000);
  });
});
