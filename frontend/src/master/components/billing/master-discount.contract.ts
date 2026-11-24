import { DiscountKind } from '../../../lib/billing-domain';

export type MasterSubscriptionDiscountType = (typeof DiscountKind)[keyof typeof DiscountKind];

export interface MasterAddDiscountInput {
  discountType: MasterSubscriptionDiscountType;
  /** User-entered percent 0–100 (not bps). */
  percent?: number;
  /** User-entered gross amount in major currency units (e.g. EUR). */
  fixedAmount?: number;
  currency?: 'EUR';
  validFrom: string;
  validTo?: string;
  reason?: string;
}

export interface MasterAddDiscountPayload {
  discountType: MasterSubscriptionDiscountType;
  percentBps?: number;
  fixedAmountCents?: number;
  currency?: string;
  validFrom: string;
  validTo?: string;
  reason?: string;
}

const MAX_PERCENT_BPS = 10_000;
const MIN_PERCENT_BPS = 1;
const MIN_FIXED_CENTS = 1;

export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

export function majorUnitsToCents(amount: number): number {
  return Math.round(amount * 100);
}

export function validateMasterAddDiscountInput(
  input: MasterAddDiscountInput,
): { ok: true; payload: MasterAddDiscountPayload } | { ok: false; error: string } {
  if (!input.validFrom || Number.isNaN(Date.parse(input.validFrom))) {
    return { ok: false, error: 'INVALID_VALID_FROM' };
  }
  if (input.validTo && Number.isNaN(Date.parse(input.validTo))) {
    return { ok: false, error: 'INVALID_VALID_TO' };
  }
  if (input.validTo && Date.parse(input.validTo) < Date.parse(input.validFrom)) {
    return { ok: false, error: 'VALID_TO_BEFORE_VALID_FROM' };
  }

  const reason = input.reason?.trim() || 'Master discount';

  if (input.discountType === DiscountKind.PERCENTAGE) {
    const percent = input.percent;
    if (percent == null || !Number.isFinite(percent) || percent <= 0 || percent > 100) {
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
        validFrom: input.validFrom,
        validTo: input.validTo,
        reason,
      },
    };
  }

  if (input.discountType === DiscountKind.FIXED_AMOUNT) {
    const fixedAmount = input.fixedAmount;
    if (fixedAmount == null || !Number.isFinite(fixedAmount) || fixedAmount <= 0) {
      return { ok: false, error: 'INVALID_FIXED_AMOUNT' };
    }
    const fixedAmountCents = majorUnitsToCents(fixedAmount);
    if (fixedAmountCents < MIN_FIXED_CENTS) {
      return { ok: false, error: 'INVALID_FIXED_AMOUNT_CENTS' };
    }
    return {
      ok: true,
      payload: {
        discountType: DiscountKind.FIXED_AMOUNT,
        fixedAmountCents,
        currency: input.currency ?? 'EUR',
        validFrom: input.validFrom,
        validTo: input.validTo,
        reason,
      },
    };
  }

  return { ok: false, error: 'UNKNOWN_DISCOUNT_TYPE' };
}

/** Human-readable preview before MFA-backed mutation (server preview API does not model discounts yet). */
export function summarizeMasterDiscountPayload(payload: MasterAddDiscountPayload): string {
  if (payload.discountType === DiscountKind.PERCENTAGE && payload.percentBps != null) {
    const pct = (payload.percentBps / 100).toFixed(2).replace(/\.00$/, '');
    return `${pct}% · ${payload.validFrom}${payload.validTo ? ` → ${payload.validTo}` : ''}`;
  }
  if (payload.discountType === DiscountKind.FIXED_AMOUNT && payload.fixedAmountCents != null) {
    const eur = (payload.fixedAmountCents / 100).toFixed(2);
    return `${eur} ${payload.currency ?? 'EUR'} · ${payload.validFrom}${
      payload.validTo ? ` → ${payload.validTo}` : ''
    }`;
  }
  return payload.reason ?? '—';
}