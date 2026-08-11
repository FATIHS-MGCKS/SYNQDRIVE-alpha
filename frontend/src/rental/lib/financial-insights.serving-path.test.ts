import { describe, expect, it, vi } from 'vitest';

// Spy on the canonical E3 calculator to prove the serving-path adapter delegates
// to it (and does not run an independent receivable formula).
vi.mock('@synq/evaluations-finance/evaluations-finance-calculator', async () => {
  const actual = await vi.importActual<
    typeof import('@synq/evaluations-finance/evaluations-finance-calculator')
  >('@synq/evaluations-finance/evaluations-finance-calculator');
  return {
    ...actual,
    computeCurrentTotalReceivables: vi.fn(actual.computeCurrentTotalReceivables),
    computeOverdueReceivables: vi.fn(actual.computeOverdueReceivables),
  };
});

import {
  computeCurrentTotalReceivables,
  computeOverdueReceivables,
} from '@synq/evaluations-finance/evaluations-finance-calculator';
import {
  currentOpenReceivablesMinor,
  currentOverdueReceivablesMinor,
  currentTotalReceivablesMinor,
  openOutgoingReceivables,
  sumCents,
  type InvoiceSlice,
} from './financial-insights.logic';

const NOW = new Date('2026-06-16T12:00:00.000Z');

function inv(o: Partial<InvoiceSlice> & { id: string }): InvoiceSlice {
  return {
    type: 'OUTGOING_MANUAL',
    status: 'SENT',
    totalCents: 10_000,
    outstandingCents: 10_000,
    paidCents: 0,
    currency: 'EUR',
    invoiceDate: '2026-06-05',
    dueDate: '2026-06-30',
    paidAt: null,
    issuedAt: null,
    createdAt: '2026-06-05',
    ...o,
  };
}

describe('financial-insights serving path uses the canonical E3 authority', () => {
  it('delegates receivable computation to the canonical calculator (CANONICAL_E3_CALLS > 0)', () => {
    (computeCurrentTotalReceivables as unknown as ReturnType<typeof vi.fn>).mockClear();
    currentTotalReceivablesMinor([inv({ id: 'a' })]);
    expect(computeCurrentTotalReceivables).toHaveBeenCalledTimes(1);
  });

  it('uses the authoritative outstanding balance, not totalCents (receivable = 70 not 100)', () => {
    const partial = inv({
      id: 'p',
      status: 'PARTIALLY_PAID',
      totalCents: 10_000,
      paidCents: 3_000,
      outstandingCents: 7_000,
      dueDate: '2026-06-30',
    });
    // Canonical serving-path KPI = 7000 (open remainder).
    expect(currentOpenReceivablesMinor([partial], NOW)).toBe(7_000);
    expect(currentTotalReceivablesMinor([partial])).toBe(7_000);
    // The legacy bug (summing totalCents of receivable rows) would be 10000.
    expect(sumCents(openOutgoingReceivables([partial], NOW))).toBe(10_000);
    expect(currentOpenReceivablesMinor([partial], NOW)).not.toBe(
      sumCents(openOutgoingReceivables([partial], NOW)),
    );
  });

  it('overdue receivables also delegate to canonical + use outstanding', () => {
    (computeOverdueReceivables as unknown as ReturnType<typeof vi.fn>).mockClear();
    const overdue = inv({
      id: 'o',
      status: 'OVERDUE',
      totalCents: 10_000,
      paidCents: 4_000,
      outstandingCents: 6_000,
      dueDate: '2026-06-01',
    });
    expect(currentOverdueReceivablesMinor([overdue], NOW)).toBe(6_000);
    expect(computeOverdueReceivables).toHaveBeenCalled();
  });
});
