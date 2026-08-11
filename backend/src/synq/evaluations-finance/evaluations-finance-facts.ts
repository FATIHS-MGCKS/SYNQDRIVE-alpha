/**
 * E3 canonical financial facts + classification (shared, framework-free).
 *
 * These are normalized, provider-agnostic projections of the authoritative
 * finance sources (org invoices and confirmed invoice payments). They exist so
 * that revenue/cashflow/receivable/result semantics have a SINGLE definition
 * used by every calculator, instead of duplicated per-surface logic.
 *
 * Financial terminology is kept strictly distinct (Book III / Appendix B):
 *   INVOICE  ≠ PAYMENT ≠ AUTHORIZATION ≠ CAPTURE ≠ DEPOSIT ≠ REFUND ≠ PAYOUT.
 * Deposits and authorizations are NOT modeled as invoices or payments here, so
 * they are excluded from revenue/cashflow/receivables by construction.
 */

/** Outgoing = customer-facing (revenue/receivable); incoming = vendor (expense). */
export type EvaluationsInvoiceDirection = 'OUTGOING' | 'INCOMING';

/**
 * A finalized/commercial invoice fact. Amounts are integer minor units in the
 * invoice's own `currency`; there is no implicit currency default.
 */
export interface EvaluationsInvoiceFact {
  readonly id: string;
  readonly direction: EvaluationsInvoiceDirection;
  readonly status: string;
  readonly currency: string;
  readonly totalMinor: number;
  readonly paidMinor: number;
  readonly outstandingMinor: number;
  /** Finalization instant of an outgoing invoice (revenue business time). */
  readonly issuedAt: string | null;
  readonly invoiceDate: string | null;
  readonly dueDate: string | null;
  readonly paidAt: string | null;
  readonly createdAt: string | null;
}

export type EvaluationsPaymentKind = 'PAYMENT' | 'REFUND';

/**
 * A confirmed/settled cash movement fact. Authorizations, pending intents and
 * captures that have not settled must NOT be projected as payment facts.
 */
export interface EvaluationsPaymentFact {
  readonly id: string;
  readonly invoiceId: string | null;
  readonly currency: string;
  /** Always a positive magnitude; direction is encoded by `kind`. */
  readonly amountMinor: number;
  readonly kind: EvaluationsPaymentKind;
  /** Settlement instant (cashflow business time). */
  readonly settledAt: string | null;
}

/** Mirrors backend `invoice-domain.util.ts` REVENUE_EXCLUDED_STATUSES. */
export const FINANCE_REVENUE_EXCLUDED_STATUSES: ReadonlySet<string> = new Set([
  'DRAFT',
  'CANCELLED',
  'CANCELED',
  'VOID',
  'CREDITED',
]);

/** Mirrors backend `invoice-domain.util.ts` EXPENSE_EXCLUDED_STATUSES. */
export const FINANCE_EXPENSE_EXCLUDED_STATUSES: ReadonlySet<string> = new Set([
  'DRAFT',
  'CANCELLED',
  'CANCELED',
  'VOID',
  'REJECTED',
]);

/** Outgoing statuses that are not open commercial demands (receivables). */
export const FINANCE_NON_OPEN_OUTGOING_STATUSES: ReadonlySet<string> = new Set([
  'DRAFT',
  'CANCELLED',
  'CANCELED',
  'VOID',
  'CREDITED',
]);

export function normalizeFinanceStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toUpperCase();
}

export function isRevenueInvoiceFact(fact: EvaluationsInvoiceFact): boolean {
  return (
    fact.direction === 'OUTGOING' &&
    !FINANCE_REVENUE_EXCLUDED_STATUSES.has(normalizeFinanceStatus(fact.status))
  );
}

export function isExpenseInvoiceFact(fact: EvaluationsInvoiceFact): boolean {
  return (
    fact.direction === 'INCOMING' &&
    !FINANCE_EXPENSE_EXCLUDED_STATUSES.has(normalizeFinanceStatus(fact.status))
  );
}

function isPaidInvoiceFact(fact: EvaluationsInvoiceFact): boolean {
  const status = normalizeFinanceStatus(fact.status);
  return status === 'PAID' || fact.outstandingMinor <= 0;
}

/**
 * Open receivable = outgoing, commercially open, still owed. Uses the
 * authoritative outstanding balance, so partial payments reduce (but do not
 * clear) the receivable.
 */
export function isOpenReceivableFact(fact: EvaluationsInvoiceFact): boolean {
  if (fact.direction !== 'OUTGOING') return false;
  if (FINANCE_NON_OPEN_OUTGOING_STATUSES.has(normalizeFinanceStatus(fact.status))) {
    return false;
  }
  if (isPaidInvoiceFact(fact)) return false;
  return fact.outstandingMinor > 0;
}

export function parseInstantMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Overdue = open receivable whose governed due timestamp is strictly before the
 * evaluation reference (or explicitly OVERDUE). `dueDate` is the authority; the
 * creation date is never used as a due date.
 */
export function isOverdueReceivableFact(
  fact: EvaluationsInvoiceFact,
  referenceMs: number,
): boolean {
  if (!isOpenReceivableFact(fact)) return false;
  if (normalizeFinanceStatus(fact.status) === 'OVERDUE') return true;
  const dueMs = parseInstantMs(fact.dueDate);
  return dueMs != null && dueMs < referenceMs;
}

/** Revenue business timestamp: finalization (`issuedAt`) then `invoiceDate`. */
export function resolveRevenueBusinessMs(fact: EvaluationsInvoiceFact): number | null {
  return parseInstantMs(fact.issuedAt) ?? parseInstantMs(fact.invoiceDate);
}

/** Expense business timestamp: `invoiceDate` then `createdAt`. */
export function resolveExpenseBusinessMs(fact: EvaluationsInvoiceFact): number | null {
  return parseInstantMs(fact.invoiceDate) ?? parseInstantMs(fact.createdAt);
}

export function isWithinWindow(
  ms: number | null,
  startMs: number,
  endExclusiveMs: number,
): boolean {
  return ms != null && ms >= startMs && ms < endExclusiveMs;
}
