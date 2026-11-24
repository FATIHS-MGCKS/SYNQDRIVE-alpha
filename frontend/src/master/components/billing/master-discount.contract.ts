import { DiscountKind } from '../../../lib/billing-domain';
import { parseEuroInput } from './master-pricing.utils';

export type MasterSubscriptionDiscountType = (typeof DiscountKind)[keyof typeof DiscountKind];

export type MasterDiscountValidationErrorCode =
  | 'INVALID_VALID_FROM'
  | 'INVALID_VALID_TO'
  | 'VALID_TO_BEFORE_VALID_FROM'
  | 'INVALID_PERCENT'
  | 'INVALID_PERCENT_BPS'
  | 'INVALID_FIXED_AMOUNT'
  | 'INVALID_FIXED_AMOUNT_CENTS'
  | 'MISSING_REASON'
  | 'UNKNOWN_DISCOUNT_TYPE';

export interface MasterAddDiscountFormInput {
  discountType: MasterSubscriptionDiscountType;
  percentInput?: string;
  fixedAmountInput?: string;
  currency?: 'EUR';
  validFromLocal?: string;
  validToLocal?: string;
  reason?: string;
}

export interface MasterAddDiscountPayload {
  discountType: MasterSubscriptionDiscountType;
  percentBps?: number;
  fixedAmountCents?: number;
  currency?: string;
  validFrom: string;
  validTo?: string;
  reason: string;
}

const MAX_PERCENT_BPS = 10_000;
const MIN_PERCENT_BPS = 1;
const MIN_FIXED_CENTS = 1;
const MIN_REASON_LENGTH = 3;

export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

export function parsePercentInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function parseDateTimeLocalInput(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

export function validateMasterAddDiscountForm(
  input: MasterAddDiscountFormInput,
  options?: { defaultValidFrom?: string },
): { ok: true; payload: MasterAddDiscountPayload } | { ok: false; error: MasterDiscountValidationErrorCode } {
  const reason = input.reason?.trim() ?? '';
  if (reason.length < MIN_REASON_LENGTH) {
    return { ok: false, error: 'MISSING_REASON' };
  }

  let validFrom: string;
  if (input.validFromLocal?.trim()) {
    const parsedFrom = parseDateTimeLocalInput(input.validFromLocal);
    if (!parsedFrom) {
      return { ok: false, error: 'INVALID_VALID_FROM' };
    }
    validFrom = parsedFrom;
  } else {
    validFrom = options?.defaultValidFrom ?? new Date().toISOString();
  }

  let validTo: string | undefined;
  if (input.validToLocal?.trim()) {
    const parsedTo = parseDateTimeLocalInput(input.validToLocal);
    if (!parsedTo) {
      return { ok: false, error: 'INVALID_VALID_TO' };
    }
    validTo = parsedTo;
    if (Date.parse(validTo) < Date.parse(validFrom)) {
      return { ok: false, error: 'VALID_TO_BEFORE_VALID_FROM' };
    }
  }

  if (input.discountType === DiscountKind.PERCENTAGE) {
    const percent = parsePercentInput(input.percentInput ?? '');
    if (percent == null || percent <= 0 || percent > 100) {
      return { ok: false, error: 'INVALID_PERCENT' };
    }
    const percentBps = percentToBps(percent);
    if (percentBps < MIN_PERCENT_BPS || percentBps > MAX_PERCENT_BPS) {
      return { ok: false, error: 'INVALID_PERCENT_BPS' };
    }
    return {
      ok: true,
      payload: {
        discountType: DiscountKind.PERCENTAGE,
        percentBps,
        validFrom,
        validTo,
        reason,
      },
    };
  }

  if (input.discountType === DiscountKind.FIXED_AMOUNT) {
    const cents = parseEuroInput(input.fixedAmountInput ?? '');
    if (cents == null || cents < MIN_FIXED_CENTS) {
      return { ok: false, error: 'INVALID_FIXED_AMOUNT_CENTS' };
    }
    return {
      ok: true,
      payload: {
        discountType: DiscountKind.FIXED_AMOUNT,
        fixedAmountCents: cents,
        currency: input.currency ?? 'EUR',
        validFrom,
        validTo,
        reason,
      },
    };
  }

  return { ok: false, error: 'UNKNOWN_DISCOUNT_TYPE' };
}

/** Descriptive summary only — not a calculated invoice preview (`previewChanges` has no discount shape). */
export function summarizeMasterDiscountPayload(payload: MasterAddDiscountPayload): string {
  if (payload.discountType === DiscountKind.PERCENTAGE && payload.percentBps != null) {
    const pct = (payload.percentBps / 100).toFixed(2).replace(/\.00$/, '');
    return `${pct}% · ${payload.reason}`;
  }
  if (payload.discountType === DiscountKind.FIXED_AMOUNT && payload.fixedAmountCents != null) {
    const eur = (payload.fixedAmountCents / 100).toFixed(2);
    return `${eur} ${payload.currency ?? 'EUR'} · ${payload.reason}`;
  }
  return payload.reason;
}

/** @deprecated use validateMasterAddDiscountForm */
export function validateMasterAddDiscountInput(
  input: MasterAddDiscountFormInput & {
    percent?: number;
    fixedAmount?: number;
    validFrom: string;
  },
): { ok: true; payload: MasterAddDiscountPayload } | { ok: false; error: string } {
  const result = validateMasterAddDiscountForm({
    discountType: input.discountType,
    percentInput: input.percent != null ? String(input.percent) : input.percentInput,
    fixedAmountInput: input.fixedAmount != null ? String(input.fixedAmount) : input.fixedAmountInput,
    currency: input.currency,
    validFromLocal: input.validFromLocal,
    validToLocal: input.validToLocal,
    reason: input.reason,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return result;
}