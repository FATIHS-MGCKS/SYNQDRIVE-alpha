import type { TaskPriority } from '@prisma/client';

/** Automation rule identity for outgoing invoice payment-check tasks. */
export const INVOICE_PAYMENT_CHECK_RULE_ID = 'invoice.payment.check';
export const INVOICE_PAYMENT_CHECK_RULE_VERSION = 1;

/** Canonical dedup scope: one active payment-check task per invoice. */
export const INVOICE_PAYMENT_TASK_DEDUP_PREFIX = 'invoice:payment-check:';

/** Legacy dedup key superseded on sync (pre-V2 invoice unpaid tasks). */
export const LEGACY_INVOICE_UNPAID_DEDUP_PREFIX = 'invoice:unpaid:';

/** Default due horizon when an invoice has no explicit due date. */
export const INVOICE_PAYMENT_DEFAULT_DUE_DAYS = 14;

/** Escalate to CRITICAL only after this much time past the due calendar day. */
export const INVOICE_PAYMENT_CRITICAL_OVERDUE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** First escalation tier once the invoice is actually overdue. */
export const INVOICE_PAYMENT_OVERDUE_PRIORITY: TaskPriority = 'HIGH';
