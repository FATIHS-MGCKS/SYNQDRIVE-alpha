import {
  type EvaluationsFinanceWindow,
  computeCashInflow,
  computeExpenses,
  computeIssuedRevenue,
  computeNetCashflow,
  computeNetResult,
  computeCurrentTotalReceivables,
  computeOverdueReceivables,
  computeProfitMargin,
  computeRefundOutflow,
} from '@synq/evaluations-finance/evaluations-finance-calculator';
import type {
  EvaluationsInvoiceFact,
  EvaluationsPaymentFact,
} from '@synq/evaluations-finance/evaluations-finance-facts';
import { moneyOfMinor } from '@synq/evaluations-finance/evaluations-money';

const JULY: EvaluationsFinanceWindow = {
  startMs: Date.parse('2026-07-01T00:00:00.000Z'),
  endExclusiveMs: Date.parse('2026-08-01T00:00:00.000Z'),
  referenceMs: Date.parse('2026-07-31T23:59:59.999Z'),
};
const AUGUST: EvaluationsFinanceWindow = {
  startMs: Date.parse('2026-08-01T00:00:00.000Z'),
  endExclusiveMs: Date.parse('2026-09-01T00:00:00.000Z'),
  referenceMs: Date.parse('2026-08-31T23:59:59.999Z'),
};

function invoice(partial: Partial<EvaluationsInvoiceFact> & Pick<EvaluationsInvoiceFact, 'id'>): EvaluationsInvoiceFact {
  return {
    direction: 'OUTGOING',
    status: 'ISSUED',
    currency: 'EUR',
    totalMinor: 10000,
    paidMinor: 0,
    outstandingMinor: 10000,
    issuedAt: '2026-07-15T10:00:00.000Z',
    invoiceDate: '2026-07-15T10:00:00.000Z',
    dueDate: '2026-07-30T00:00:00.000Z',
    paidAt: null,
    createdAt: '2026-07-15T10:00:00.000Z',
    ...partial,
  };
}

function payment(partial: Partial<EvaluationsPaymentFact> & Pick<EvaluationsPaymentFact, 'id'>): EvaluationsPaymentFact {
  return {
    invoiceId: 'inv-1',
    currency: 'EUR',
    amountMinor: 10000,
    kind: 'PAYMENT',
    settledAt: '2026-08-02T10:00:00.000Z',
    ...partial,
  };
}

describe('evaluations finance calculator (E3)', () => {
  describe('Fixture A — revenue vs cashflow period separation', () => {
    const invoices = [invoice({ id: 'inv-1', status: 'ISSUED', outstandingMinor: 10000 })];
    const payments = [payment({ id: 'pay-1', settledAt: '2026-08-02T10:00:00.000Z' })];

    it('recognizes issued revenue in July (invoice period)', () => {
      expect(computeIssuedRevenue(invoices, JULY).perCurrency).toEqual([moneyOfMinor(10000, 'EUR')]);
    });
    it('does not recognize August cash as July cashflow', () => {
      expect(computeCashInflow(payments, JULY).perCurrency).toEqual([]);
    });
    it('recognizes the settlement as August cashflow', () => {
      expect(computeCashInflow(payments, AUGUST).perCurrency).toEqual([moneyOfMinor(10000, 'EUR')]);
    });
    it('does not double count July issued revenue in August', () => {
      expect(computeIssuedRevenue(invoices, AUGUST).perCurrency).toEqual([]);
    });
  });

  describe('Fixture B — partial payment receivable', () => {
    const invoices = [
      invoice({ id: 'inv-1', status: 'PARTIALLY_PAID', totalMinor: 10000, paidMinor: 3000, outstandingMinor: 7000 }),
    ];
    it('open receivable is the authoritative outstanding (70), not total or zero', () => {
      expect(computeCurrentTotalReceivables(invoices).perCurrency).toEqual([
        moneyOfMinor(7000, 'EUR'),
      ]);
    });
    it('cashflow reflects the 30 settled, not 100', () => {
      const payments = [payment({ id: 'pay-1', amountMinor: 3000, settledAt: '2026-07-10T00:00:00.000Z' })];
      expect(computeCashInflow(payments, JULY).perCurrency).toEqual([moneyOfMinor(3000, 'EUR')]);
    });
  });

  describe('Fixture C — refund period + no auto revenue deduction', () => {
    const payments = [
      payment({ id: 'pay-1', amountMinor: 10000, kind: 'PAYMENT', settledAt: '2026-07-05T00:00:00.000Z' }),
      payment({ id: 'ref-1', amountMinor: 2000, kind: 'REFUND', settledAt: '2026-08-05T00:00:00.000Z' }),
    ];
    it('July net cashflow reflects only the inflow', () => {
      expect(computeNetCashflow(payments, JULY).perCurrency).toEqual([moneyOfMinor(10000, 'EUR')]);
    });
    it('August net cashflow reflects the refund outflow in its settlement period', () => {
      expect(computeNetCashflow(payments, AUGUST).perCurrency).toEqual([moneyOfMinor(-2000, 'EUR')]);
      expect(computeRefundOutflow(payments, AUGUST).perCurrency).toEqual([moneyOfMinor(2000, 'EUR')]);
    });
    it('does not deduct the refund from issued revenue automatically', () => {
      const invoices = [invoice({ id: 'inv-1' })];
      expect(computeIssuedRevenue(invoices, JULY).perCurrency).toEqual([moneyOfMinor(10000, 'EUR')]);
    });
  });

  describe('Fixture D — deposit exclusion (deposits are not invoices/payments)', () => {
    it('deposit-only scenario leaves revenue and cashflow at empty', () => {
      // Deposits/authorizations are not projected as invoice or payment facts.
      expect(computeIssuedRevenue([], JULY).perCurrency).toEqual([]);
      expect(computeCashInflow([], JULY).perCurrency).toEqual([]);
    });
  });

  describe('overdue receivables', () => {
    it('uses the governed due timestamp, not createdAt', () => {
      const overdue = invoice({
        id: 'inv-1',
        status: 'ISSUED',
        dueDate: '2026-07-10T00:00:00.000Z',
        outstandingMinor: 5000,
      });
      const notYetDue = invoice({
        id: 'inv-2',
        status: 'ISSUED',
        dueDate: '2026-09-10T00:00:00.000Z',
        outstandingMinor: 5000,
      });
      const ref = Date.parse('2026-07-31T00:00:00.000Z');
      expect(computeOverdueReceivables([overdue, notYetDue], ref).perCurrency).toEqual([
        moneyOfMinor(5000, 'EUR'),
      ]);
    });
    it('excludes paid / void / cancelled from receivables', () => {
      const paid = invoice({ id: 'p', status: 'PAID', outstandingMinor: 0 });
      const voided = invoice({ id: 'v', status: 'VOID', outstandingMinor: 10000 });
      const cancelled = invoice({ id: 'c', status: 'CANCELLED', outstandingMinor: 10000 });
      expect(computeCurrentTotalReceivables([paid, voided, cancelled]).perCurrency).toEqual([]);
    });
    it('never produces a negative receivable', () => {
      const credit = invoice({ id: 'x', status: 'ISSUED', outstandingMinor: -500 });
      expect(computeCurrentTotalReceivables([credit]).perCurrency).toEqual([]);
    });
  });

  describe('result + profit margin', () => {
    it('net result = revenue − expenses per currency', () => {
      const revenue = computeIssuedRevenue([invoice({ id: 'r', totalMinor: 10000 })], JULY);
      const expenses = computeExpenses(
        [invoice({ id: 'e', direction: 'INCOMING', status: 'APPROVED', totalMinor: 4000, invoiceDate: '2026-07-10T00:00:00.000Z' })],
        JULY,
      );
      expect(computeNetResult(revenue, expenses).perCurrency).toEqual([moneyOfMinor(6000, 'EUR')]);
    });
    it('profit margin is NOT_APPLICABLE for zero revenue (never NaN/Infinity)', () => {
      const revenue = computeIssuedRevenue([], JULY);
      const net = computeNetResult(revenue, computeExpenses([], JULY));
      expect(computeProfitMargin(net, revenue)).toEqual({
        kind: 'NOT_APPLICABLE',
        reason: 'ZERO_REVENUE_DENOMINATOR',
      });
    });
    it('profit margin is NOT_APPLICABLE for multi-currency without reporting currency', () => {
      const revenue = computeIssuedRevenue(
        [invoice({ id: 'a', currency: 'EUR' }), invoice({ id: 'b', currency: 'USD' })],
        JULY,
      );
      const net = computeNetResult(revenue, computeExpenses([], JULY));
      expect(computeProfitMargin(net, revenue).kind).toBe('NOT_APPLICABLE');
    });
    it('computes a finite percent for a single-currency scope', () => {
      const revenue = computeIssuedRevenue([invoice({ id: 'r', totalMinor: 10000 })], JULY);
      const net = computeNetResult(
        revenue,
        computeExpenses(
          [invoice({ id: 'e', direction: 'INCOMING', status: 'APPROVED', totalMinor: 2500, invoiceDate: '2026-07-10T00:00:00.000Z' })],
          JULY,
        ),
      );
      expect(computeProfitMargin(net, revenue)).toEqual({ kind: 'PERCENT', value: 75, currency: 'EUR' });
    });
  });

  describe('multi-currency aggregates', () => {
    it('keeps EUR and USD revenue separate (no mixed total)', () => {
      const invoices = [
        invoice({ id: 'a', currency: 'EUR', totalMinor: 10000 }),
        invoice({ id: 'b', currency: 'USD', totalMinor: 10000 }),
      ];
      expect(computeIssuedRevenue(invoices, JULY).perCurrency).toEqual([
        moneyOfMinor(10000, 'EUR'),
        moneyOfMinor(10000, 'USD'),
      ]);
    });
  });
});
