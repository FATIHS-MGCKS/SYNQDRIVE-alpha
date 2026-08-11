/**
 * E3 canonical finance calculator (shared, pure, framework-free).
 *
 * This is the single arithmetic authority for evaluations revenue, cashflow,
 * receivables and result. It only consumes canonical financial facts and only
 * emits currency-safe per-currency aggregates (never a blended mixed total).
 *
 * Semantics (see docs/audits/pr-recovery/phase3-e3-financial-semantic-matrix):
 *   - Issued revenue: finalized outgoing invoices by revenue business time.
 *   - Cashflow: settled payments (inflow) minus settled refunds (outflow) by
 *     settlement time. Refunds affect cashflow in their settlement period only.
 *   - Open receivables: point-in-time authoritative outstanding balance.
 *   - Result: revenue minus authoritative expenses (existing incoming invoices);
 *     no estimated/E4 costs are ever introduced.
 */
import type { EvaluationsMoney } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import { sumMoneyByCurrency, subtractMoney, moneyOfMinor } from './evaluations-money';
import {
  type EvaluationsInvoiceFact,
  type EvaluationsPaymentFact,
  isExpenseInvoiceFact,
  isOpenReceivableFact,
  isOverdueReceivableFact,
  isRevenueInvoiceFact,
  isWithinWindow,
  parseInstantMs,
  resolveExpenseBusinessMs,
  resolveRevenueBusinessMs,
} from './evaluations-finance-facts';

export interface EvaluationsFinanceWindow {
  readonly startMs: number;
  readonly endExclusiveMs: number;
  /** Point-in-time reference (e.g. "as of now") for receivables/overdue. */
  readonly referenceMs: number;
}

/**
 * A currency-safe aggregate. `perCurrency` is sorted and may be empty (a true
 * empty period). `includedCount` / `excludedCount` support data-coverage.
 */
export interface EvaluationsFinanceAggregate {
  readonly perCurrency: readonly EvaluationsMoney[];
  readonly includedCount: number;
  readonly excludedCount: number;
}

function aggregate(
  contributions: readonly EvaluationsMoney[],
  includedCount: number,
  excludedCount: number,
): EvaluationsFinanceAggregate {
  return {
    perCurrency: sumMoneyByCurrency(contributions),
    includedCount,
    excludedCount,
  };
}

export function computeIssuedRevenue(
  invoices: readonly EvaluationsInvoiceFact[],
  window: EvaluationsFinanceWindow,
): EvaluationsFinanceAggregate {
  const contributions: EvaluationsMoney[] = [];
  let excluded = 0;
  for (const inv of invoices) {
    if (!isRevenueInvoiceFact(inv)) {
      excluded += 1;
      continue;
    }
    if (!isWithinWindow(resolveRevenueBusinessMs(inv), window.startMs, window.endExclusiveMs)) {
      excluded += 1;
      continue;
    }
    contributions.push(moneyOfMinor(inv.totalMinor, inv.currency));
  }
  return aggregate(contributions, contributions.length, excluded);
}

export function computeExpenses(
  invoices: readonly EvaluationsInvoiceFact[],
  window: EvaluationsFinanceWindow,
): EvaluationsFinanceAggregate {
  const contributions: EvaluationsMoney[] = [];
  let excluded = 0;
  for (const inv of invoices) {
    if (!isExpenseInvoiceFact(inv)) {
      excluded += 1;
      continue;
    }
    if (!isWithinWindow(resolveExpenseBusinessMs(inv), window.startMs, window.endExclusiveMs)) {
      excluded += 1;
      continue;
    }
    contributions.push(moneyOfMinor(inv.totalMinor, inv.currency));
  }
  return aggregate(contributions, contributions.length, excluded);
}

/** Settled inbound payments only (deposits/authorizations are not payment facts). */
export function computeCashInflow(
  payments: readonly EvaluationsPaymentFact[],
  window: EvaluationsFinanceWindow,
): EvaluationsFinanceAggregate {
  const contributions: EvaluationsMoney[] = [];
  let excluded = 0;
  for (const payment of payments) {
    if (payment.kind !== 'PAYMENT') {
      excluded += 1;
      continue;
    }
    if (!isWithinWindow(parseInstantMs(payment.settledAt), window.startMs, window.endExclusiveMs)) {
      excluded += 1;
      continue;
    }
    contributions.push(moneyOfMinor(payment.amountMinor, payment.currency));
  }
  return aggregate(contributions, contributions.length, excluded);
}

/** Settled refund outflows in their own settlement period. */
export function computeRefundOutflow(
  payments: readonly EvaluationsPaymentFact[],
  window: EvaluationsFinanceWindow,
): EvaluationsFinanceAggregate {
  const contributions: EvaluationsMoney[] = [];
  let excluded = 0;
  for (const payment of payments) {
    if (payment.kind !== 'REFUND') {
      excluded += 1;
      continue;
    }
    if (!isWithinWindow(parseInstantMs(payment.settledAt), window.startMs, window.endExclusiveMs)) {
      excluded += 1;
      continue;
    }
    contributions.push(moneyOfMinor(payment.amountMinor, payment.currency));
  }
  return aggregate(contributions, contributions.length, excluded);
}

/** Net cashflow = inflow − refund outflow, computed independently per currency. */
export function computeNetCashflow(
  payments: readonly EvaluationsPaymentFact[],
  window: EvaluationsFinanceWindow,
): EvaluationsFinanceAggregate {
  const inflow = computeCashInflow(payments, window);
  const outflow = computeRefundOutflow(payments, window);
  const byCurrency = new Map<string, EvaluationsMoney>();
  for (const money of inflow.perCurrency) byCurrency.set(money.currency, money);
  for (const money of outflow.perCurrency) {
    const existing = byCurrency.get(money.currency) ?? moneyOfMinor(0, money.currency);
    byCurrency.set(money.currency, subtractMoney(existing, money));
  }
  const perCurrency = [...byCurrency.values()].sort((a, b) =>
    a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0,
  );
  return {
    perCurrency,
    includedCount: inflow.includedCount + outflow.includedCount,
    excludedCount: inflow.excludedCount + outflow.excludedCount,
  };
}

/** Point-in-time open receivables: authoritative outstanding balance, no negatives. */
export function computeOpenReceivables(
  invoices: readonly EvaluationsInvoiceFact[],
  referenceMs: number,
): EvaluationsFinanceAggregate {
  const contributions: EvaluationsMoney[] = [];
  let excluded = 0;
  for (const inv of invoices) {
    if (!isOpenReceivableFact(inv)) {
      excluded += 1;
      continue;
    }
    contributions.push(moneyOfMinor(inv.outstandingMinor, inv.currency));
  }
  void referenceMs;
  return aggregate(contributions, contributions.length, excluded);
}

/** Point-in-time overdue receivables: outstanding > 0 and past governed due time. */
export function computeOverdueReceivables(
  invoices: readonly EvaluationsInvoiceFact[],
  referenceMs: number,
): EvaluationsFinanceAggregate {
  const contributions: EvaluationsMoney[] = [];
  let excluded = 0;
  for (const inv of invoices) {
    if (!isOverdueReceivableFact(inv, referenceMs)) {
      excluded += 1;
      continue;
    }
    contributions.push(moneyOfMinor(inv.outstandingMinor, inv.currency));
  }
  return aggregate(contributions, contributions.length, excluded);
}

/**
 * Per-currency subtraction of two aggregates (`minuend − subtrahend`).
 * Currencies present in only one side are carried through so no currency is
 * silently dropped.
 */
export function subtractAggregates(
  minuend: EvaluationsFinanceAggregate,
  subtrahend: EvaluationsFinanceAggregate,
): EvaluationsFinanceAggregate {
  const byCurrency = new Map<string, EvaluationsMoney>();
  for (const money of minuend.perCurrency) byCurrency.set(money.currency, money);
  for (const money of subtrahend.perCurrency) {
    const existing = byCurrency.get(money.currency) ?? moneyOfMinor(0, money.currency);
    byCurrency.set(money.currency, subtractMoney(existing, money));
  }
  const perCurrency = [...byCurrency.values()].sort((a, b) =>
    a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0,
  );
  return {
    perCurrency,
    includedCount: minuend.includedCount + subtrahend.includedCount,
    excludedCount: minuend.excludedCount + subtrahend.excludedCount,
  };
}

/**
 * Net result = revenue − expenses per currency. Currencies present in only one
 * side are carried through (revenue-only positive, expense-only negative) so no
 * currency is silently dropped.
 */
export function computeNetResult(
  revenue: EvaluationsFinanceAggregate,
  expenses: EvaluationsFinanceAggregate,
): EvaluationsFinanceAggregate {
  return subtractAggregates(revenue, expenses);
}

export type EvaluationsProfitMargin =
  | { readonly kind: 'PERCENT'; readonly value: number; readonly currency: string }
  | { readonly kind: 'NOT_APPLICABLE'; readonly reason: string };

/**
 * Profit margin for a single-currency scope. Zero revenue is NOT_APPLICABLE
 * (never NaN/Infinity/blind 0). Multi-currency inputs are NOT_APPLICABLE without
 * a reporting-currency conversion.
 */
export function computeProfitMargin(
  netResult: EvaluationsFinanceAggregate,
  revenue: EvaluationsFinanceAggregate,
): EvaluationsProfitMargin {
  if (revenue.perCurrency.length > 1 || netResult.perCurrency.length > 1) {
    return { kind: 'NOT_APPLICABLE', reason: 'MULTI_CURRENCY_WITHOUT_REPORTING_CURRENCY' };
  }
  const revenueMoney = revenue.perCurrency[0];
  if (!revenueMoney || revenueMoney.amountMinor === 0) {
    return { kind: 'NOT_APPLICABLE', reason: 'ZERO_REVENUE_DENOMINATOR' };
  }
  const netMoney = netResult.perCurrency.find((m) => m.currency === revenueMoney.currency);
  const netMinor = netMoney ? netMoney.amountMinor : 0;
  const value = (netMinor / revenueMoney.amountMinor) * 100;
  return { kind: 'PERCENT', value, currency: revenueMoney.currency };
}
