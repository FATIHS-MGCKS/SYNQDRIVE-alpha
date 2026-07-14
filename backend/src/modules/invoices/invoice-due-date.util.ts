import { InvoiceDueDateBase } from '@prisma/client';
import {
  DEFAULT_TARIFF_TIMEZONE,
  zonedDateOnly,
  zonedStartOfDayToUtc,
} from '@modules/pricing/tariff-instant.util';

export { InvoiceDueDateBase };

export const SYSTEM_DEFAULT_PAYMENT_TERMS_DAYS = 7;

export type OrgDueDateSettings = {
  paymentTermsDays: number;
  timezone?: string | null;
};

export function normalizePaymentTermsDays(days: number | null | undefined): number {
  if (days == null || !Number.isFinite(days) || days < 0) {
    return SYSTEM_DEFAULT_PAYMENT_TERMS_DAYS;
  }
  return Math.round(days);
}

export function resolveOrgTimezone(timezone?: string | null): string {
  const trimmed = timezone?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_TARIFF_TIMEZONE;
}

function addCalendarDaysToDateOnly(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Due date = start of anchor calendar day + N days in org timezone. */
export function computeDueDateFromTerms(
  anchor: Date,
  termsDays: number,
  timezone: string,
): Date {
  const anchorDateOnly = zonedDateOnly(anchor, timezone);
  const dueDateOnly = addCalendarDaysToDateOnly(anchorDateOnly, termsDays);
  return zonedStartOfDayToUtc(dueDateOnly, timezone);
}

export function parseDueDateInput(value: string | Date, timezone: string): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error('Invalid due date');
    }
    return value;
  }
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return zonedStartOfDayToUtc(trimmed, timezone);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid due date');
  }
  return parsed;
}

export type ResolveDueDateInput = {
  explicitDueDate?: string | Date | null;
  dueDateBase?: InvoiceDueDateBase | null;
  invoiceDate: Date;
  issuedAt?: Date | null;
  bookingStartDate?: Date | null;
  paymentTermsDays: number;
  timezone: string;
  isOutgoing: boolean;
};

export type ResolvedDueDate = {
  dueDate: Date | null;
  dueDateBase: InvoiceDueDateBase | null;
  paymentTermsDaysAtCreate: number | null;
};

function resolveAnchorDate(
  base: InvoiceDueDateBase,
  input: ResolveDueDateInput,
): Date | null {
  switch (base) {
    case 'INVOICE_DATE':
      return input.invoiceDate;
    case 'ISSUE_DATE':
      return input.issuedAt ?? input.invoiceDate;
    case 'BOOKING_START':
      return input.bookingStartDate ?? null;
    case 'CUSTOM':
      return null;
    default:
      return input.invoiceDate;
  }
}

/**
 * Resolves due date for create paths.
 * Explicit `dueDate` → CUSTOM. Incoming without explicit due date → null.
 * Outgoing auto → INVOICE_DATE + org payment terms (not booking start).
 */
export function resolveDueDateForCreate(input: ResolveDueDateInput): ResolvedDueDate {
  const timezone = resolveOrgTimezone(input.timezone);

  if (input.explicitDueDate) {
    return {
      dueDate: parseDueDateInput(input.explicitDueDate, timezone),
      dueDateBase: InvoiceDueDateBase.CUSTOM,
      paymentTermsDaysAtCreate: null,
    };
  }

  if (!input.isOutgoing) {
    return {
      dueDate: null,
      dueDateBase: null,
      paymentTermsDaysAtCreate: null,
    };
  }

  const base = input.dueDateBase ?? InvoiceDueDateBase.INVOICE_DATE;
  if (base === InvoiceDueDateBase.CUSTOM) {
    return {
      dueDate: null,
      dueDateBase: InvoiceDueDateBase.CUSTOM,
      paymentTermsDaysAtCreate: null,
    };
  }

  const terms = normalizePaymentTermsDays(input.paymentTermsDays);
  const anchor = resolveAnchorDate(base, input);
  if (!anchor) {
    return {
      dueDate: null,
      dueDateBase: base,
      paymentTermsDaysAtCreate: terms,
    };
  }

  return {
    dueDate: computeDueDateFromTerms(anchor, terms, timezone),
    dueDateBase: base,
    paymentTermsDaysAtCreate: terms,
  };
}

/** On issue: recalculate only when base is ISSUE_DATE (not CUSTOM / legacy null). */
export function resolveDueDateOnIssue(input: {
  dueDateBase: InvoiceDueDateBase | null;
  currentDueDate: Date | null;
  issuedAt: Date;
  paymentTermsDaysAtCreate: number | null;
  paymentTermsDays: number;
  timezone: string;
}): Date | null {
  if (input.dueDateBase === InvoiceDueDateBase.CUSTOM) {
    return input.currentDueDate;
  }
  if (input.dueDateBase !== InvoiceDueDateBase.ISSUE_DATE) {
    return input.currentDueDate;
  }
  const terms = normalizePaymentTermsDays(
    input.paymentTermsDaysAtCreate ?? input.paymentTermsDays,
  );
  return computeDueDateFromTerms(
    input.issuedAt,
    terms,
    resolveOrgTimezone(input.timezone),
  );
}
