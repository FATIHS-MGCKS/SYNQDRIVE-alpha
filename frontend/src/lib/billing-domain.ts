/**
 * Canonical billing domain types — aligned with
 * `backend/src/modules/billing/domain/billing-domain.types.ts`
 */

export const BillingProductKind = {
  RENTAL: 'RENTAL',
  FLEET: 'FLEET',
  ADDON: 'ADDON',
} as const;
export type BillingProductKind =
  (typeof BillingProductKind)[keyof typeof BillingProductKind];

export const BillingAddonKey = {
  VOICE_AGENT: 'VOICE_AGENT',
  AI_PACKAGE: 'AI_PACKAGE',
  WHATSAPP: 'WHATSAPP',
} as const;
export type BillingAddonKey = (typeof BillingAddonKey)[keyof typeof BillingAddonKey];

export const SubscriptionStatus = {
  DRAFT: 'DRAFT',
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  PAUSED: 'PAUSED',
  CANCEL_SCHEDULED: 'CANCEL_SCHEDULED',
  CANCELLED: 'CANCELLED',
  INCOMPLETE: 'INCOMPLETE',
} as const;
export type SubscriptionStatus =
  (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const BillingIntervalKind = {
  MONTH: 'MONTH',
  YEAR: 'YEAR',
} as const;

export const PricingModel = {
  VOLUME: 'VOLUME',
  GRADUATED: 'GRADUATED',
  FLAT: 'FLAT',
  USAGE_BASED: 'USAGE_BASED',
} as const;

export const DiscountKind = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED_AMOUNT: 'FIXED_AMOUNT',
} as const;

export const InvoiceStatusDomain = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  PAID: 'PAID',
  VOID: 'VOID',
  UNCOLLECTIBLE: 'UNCOLLECTIBLE',
} as const;
export type InvoiceStatusDomain =
  (typeof InvoiceStatusDomain)[keyof typeof InvoiceStatusDomain];

export const PaymentStatusDomain = {
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
} as const;

export const StripeMode = {
  TEST: 'TEST',
  LIVE: 'LIVE',
} as const;

export const SyncStatus = {
  PENDING: 'PENDING',
  SYNCED: 'SYNCED',
  FAILED: 'FAILED',
  DRIFTED: 'DRIFTED',
} as const;

export const InvoiceDisplayStatus = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  VOID: 'Void',
  UNCOLLECTIBLE: 'Uncollectible',
} as const;
export type InvoiceDisplayStatus =
  (typeof InvoiceDisplayStatus)[keyof typeof InvoiceDisplayStatus];

export function normalizeInvoiceStatusInput(
  status: string | null | undefined,
): InvoiceStatusDomain {
  const raw = (status ?? '').toUpperCase();
  switch (raw) {
    case InvoiceStatusDomain.PAID:
    case 'PAID':
      return InvoiceStatusDomain.PAID;
    case InvoiceStatusDomain.VOID:
    case 'VOID':
      return InvoiceStatusDomain.VOID;
    case InvoiceStatusDomain.OPEN:
    case 'OPEN':
      return InvoiceStatusDomain.OPEN;
    case InvoiceStatusDomain.DRAFT:
    case 'DRAFT':
      return InvoiceStatusDomain.DRAFT;
    case InvoiceStatusDomain.UNCOLLECTIBLE:
    case 'UNCOLLECTIBLE':
      return InvoiceStatusDomain.UNCOLLECTIBLE;
    case 'OVERDUE':
      return InvoiceStatusDomain.UNCOLLECTIBLE;
    case 'PENDING':
      return InvoiceStatusDomain.OPEN;
    default:
      return InvoiceStatusDomain.DRAFT;
  }
}

/** VOID must never display as Paid. */
export function mapInvoiceDomainToDisplayStatus(
  status: InvoiceStatusDomain,
  opts?: { dueDate?: string | null; now?: Date },
): InvoiceDisplayStatus {
  const now = opts?.now ?? new Date();
  const due = opts?.dueDate ? new Date(opts.dueDate) : null;

  switch (status) {
    case InvoiceStatusDomain.PAID:
      return InvoiceDisplayStatus.PAID;
    case InvoiceStatusDomain.VOID:
      return InvoiceDisplayStatus.VOID;
    case InvoiceStatusDomain.DRAFT:
      return InvoiceDisplayStatus.PENDING;
    case InvoiceStatusDomain.OPEN:
      return due && due < now ? InvoiceDisplayStatus.OVERDUE : InvoiceDisplayStatus.PENDING;
    case InvoiceStatusDomain.UNCOLLECTIBLE:
      return InvoiceDisplayStatus.OVERDUE;
    default:
      return InvoiceDisplayStatus.PENDING;
  }
}

export function mapInvoiceStatusToLabel(
  status: string | null | undefined,
  opts?: { dueDate?: string | null },
): string {
  const domain = normalizeInvoiceStatusInput(status);
  const display = mapInvoiceDomainToDisplayStatus(domain, opts);
  switch (display) {
    case InvoiceDisplayStatus.PAID:
      return 'Bezahlt';
    case InvoiceDisplayStatus.VOID:
      return 'Storniert';
    case InvoiceDisplayStatus.OVERDUE:
      return 'Überfällig';
    case InvoiceDisplayStatus.PENDING:
    case InvoiceDisplayStatus.DRAFT:
      return 'Offen';
    case InvoiceDisplayStatus.UNCOLLECTIBLE:
      return 'Uneinbringlich';
    default:
      return 'Offen';
  }
}

export function mapInvoiceStatusToTone(status: string | null | undefined): string {
  const domain = normalizeInvoiceStatusInput(status);
  if (domain === InvoiceStatusDomain.PAID) return 'sq-tone-success';
  if (
    domain === InvoiceStatusDomain.UNCOLLECTIBLE ||
    domain === InvoiceStatusDomain.VOID
  ) {
    return domain === InvoiceStatusDomain.VOID ? 'sq-tone-neutral' : 'sq-tone-critical';
  }
  return 'sq-tone-warning';
}
