import { TaskPriority } from '@prisma/client';
import { resolveZonedCalendarDayWindow } from '@modules/bookings/booking-day-window.util';
import { DEFAULT_TARIFF_TIMEZONE } from '@modules/pricing/tariff-instant.util';
import {
  INVOICE_PAYMENT_CRITICAL_OVERDUE_AFTER_MS,
  INVOICE_PAYMENT_DEFAULT_DUE_DAYS,
  INVOICE_PAYMENT_OVERDUE_PRIORITY,
  INVOICE_PAYMENT_TASK_DEDUP_PREFIX,
  LEGACY_INVOICE_UNPAID_DEDUP_PREFIX,
} from './invoice-payment-task.rules';

export interface InvoicePaymentTaskTiming {
  dueDate: Date;
  scheduledActivatesAt: Date;
  activatesAt: Date;
  priority: TaskPriority;
  isOverdue: boolean;
  isPlanned: boolean;
  timeZone: string;
}

export function invoicePaymentCheckDedupKey(invoiceId: string): string {
  return `${INVOICE_PAYMENT_TASK_DEDUP_PREFIX}${invoiceId}`;
}

export function legacyInvoiceUnpaidDedupKey(invoiceId: string): string {
  return `${LEGACY_INVOICE_UNPAID_DEDUP_PREFIX}${invoiceId}`;
}

export function isInvoicePaymentCheckDedupKey(dedupKey: string | null | undefined): boolean {
  if (!dedupKey) return false;
  return (
    dedupKey.startsWith(INVOICE_PAYMENT_TASK_DEDUP_PREFIX) ||
    dedupKey.startsWith(LEGACY_INVOICE_UNPAID_DEDUP_PREFIX)
  );
}

export function resolveInvoicePaymentDueDate(input: {
  dueDate: Date | null | undefined;
  invoiceDate: Date;
}): Date {
  if (input.dueDate) return new Date(input.dueDate);
  const fallback = new Date(input.invoiceDate);
  fallback.setUTCDate(fallback.getUTCDate() + INVOICE_PAYMENT_DEFAULT_DUE_DAYS);
  return fallback;
}

function clampActivatesAt(scheduledActivatesAt: Date, now: Date): Date {
  return scheduledActivatesAt.getTime() <= now.getTime() ? now : scheduledActivatesAt;
}

function resolvePaymentCheckPriority(
  dueDate: Date,
  now: Date,
  timeZone: string,
): { priority: TaskPriority; isOverdue: boolean } {
  const { todayEnd } = resolveZonedCalendarDayWindow(dueDate, timeZone);
  const overdueMs = now.getTime() - todayEnd.getTime();
  if (overdueMs <= 0) {
    return { priority: 'NORMAL', isOverdue: false };
  }
  if (overdueMs >= INVOICE_PAYMENT_CRITICAL_OVERDUE_AFTER_MS) {
    return { priority: 'CRITICAL', isOverdue: true };
  }
  return { priority: INVOICE_PAYMENT_OVERDUE_PRIORITY, isOverdue: true };
}

/**
 * Payment-check tasks activate on the due calendar day (org timezone) and stay
 * PLANNED until then. Priority escalates only after the due day has passed.
 */
export function computeInvoicePaymentTaskTiming(
  dueDate: Date,
  now: Date,
  timeZone: string = DEFAULT_TARIFF_TIMEZONE,
): InvoicePaymentTaskTiming {
  const tz = timeZone.trim() || DEFAULT_TARIFF_TIMEZONE;
  const { todayStart } = resolveZonedCalendarDayWindow(dueDate, tz);
  const scheduledActivatesAt = todayStart;
  const activatesAt = clampActivatesAt(scheduledActivatesAt, now);
  const { priority, isOverdue } = resolvePaymentCheckPriority(dueDate, now, tz);
  const isPlanned = activatesAt.getTime() > now.getTime();

  return {
    dueDate,
    scheduledActivatesAt,
    activatesAt,
    priority,
    isOverdue,
    isPlanned,
    timeZone: tz,
  };
}

export function buildOutgoingPaymentCheckTitle(invoiceNumberLabel: string): string {
  const label = invoiceNumberLabel.trim() || 'ohne Nummer';
  return `Zahlungseingang prüfen: Rechnung ${label}`;
}

export function buildIncomingPaymentCheckTitle(invoiceTitle: string): string {
  return `Eingangsrechnung bezahlen: ${invoiceTitle}`;
}
