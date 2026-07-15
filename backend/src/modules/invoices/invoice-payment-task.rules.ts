import type { TaskPriority } from '@prisma/client';
import {
  getAutomationRuleByCatalogKey,
  getConfigurableNumberDefault,
  getConfigurableStringDefault,
  INVOICE_PAYMENT_TASK_DEDUP_PREFIX,
  LEGACY_INVOICE_UNPAID_DEDUP_PREFIX,
} from '@modules/tasks/automation/task-automation-rule.util';

const invoicePaymentRule = getAutomationRuleByCatalogKey('INVOICE_PAYMENT_CHECK');

/** Automation rule identity for outgoing invoice payment-check tasks. */
export const INVOICE_PAYMENT_CHECK_RULE_ID = invoicePaymentRule.ruleId;
export const INVOICE_PAYMENT_CHECK_RULE_VERSION = invoicePaymentRule.version;

/** Canonical dedup scope: one active payment-check task per invoice. */
export { INVOICE_PAYMENT_TASK_DEDUP_PREFIX, LEGACY_INVOICE_UNPAID_DEDUP_PREFIX };

/** Default due horizon when an invoice has no explicit due date. */
export const INVOICE_PAYMENT_DEFAULT_DUE_DAYS = getConfigurableNumberDefault(
  invoicePaymentRule,
  'defaultDueDays',
  14,
);

/** Escalate to CRITICAL only after this much time past the due calendar day. */
export const INVOICE_PAYMENT_CRITICAL_OVERDUE_AFTER_MS =
  getConfigurableNumberDefault(invoicePaymentRule, 'criticalOverdueAfterDays', 7) *
  24 *
  60 *
  60 *
  1000;

/** First escalation tier once the invoice is actually overdue. */
export const INVOICE_PAYMENT_OVERDUE_PRIORITY: TaskPriority = getConfigurableStringDefault(
  invoicePaymentRule,
  'overduePriority',
  'HIGH',
) as TaskPriority;
