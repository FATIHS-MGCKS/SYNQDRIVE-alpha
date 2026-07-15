import { DiscountKind } from './billing-domain.types';
import { ResolvedDiscount } from './billing-resolver.types';

export const DiscountApplicationErrorCode = {
  DISCOUNT_EXPIRED: 'DISCOUNT_EXPIRED',
  DISCOUNT_NOT_YET_VALID: 'DISCOUNT_NOT_YET_VALID',
  DISCOUNT_CURRENCY_MISMATCH: 'DISCOUNT_CURRENCY_MISMATCH',
  DISCOUNT_PERCENT_INVALID: 'DISCOUNT_PERCENT_INVALID',
  DISCOUNT_FIXED_NEGATIVE: 'DISCOUNT_FIXED_NEGATIVE',
  DISCOUNT_ALREADY_APPLIED: 'DISCOUNT_ALREADY_APPLIED',
  DISCOUNT_SCOPE_MISMATCH: 'DISCOUNT_SCOPE_MISMATCH',
  DISCOUNT_DUPLICATE_SORT_ORDER: 'DISCOUNT_DUPLICATE_SORT_ORDER',
} as const;

export type DiscountApplicationErrorCode =
  (typeof DiscountApplicationErrorCode)[keyof typeof DiscountApplicationErrorCode];

export interface DiscountScheduleValidationError {
  code: DiscountApplicationErrorCode;
  discountId?: string;
  relatedDiscountId?: string;
}

export interface AppliedDiscountLine {
  discountId: string;
  kind: DiscountKind;
  percentBps: number | null;
  fixedAmountCents: number | null;
  appliedAmountCents: number;
  sortOrder: number;
  reason: string | null;
  subscriptionItemId: string | null;
  validFrom: Date;
  validTo: Date | null;
}

export interface SkippedDiscountLine {
  discountId: string;
  code: DiscountApplicationErrorCode;
}

export interface ApplyDiscountsInput {
  baseAmountCents: number;
  currency: string;
  discounts: ResolvedDiscount[];
  asOf?: Date;
  subscriptionItemId?: string | null;
}

export interface ApplyDiscountsResult {
  baseAmountCents: number;
  appliedDiscounts: AppliedDiscountLine[];
  skippedDiscounts: SkippedDiscountLine[];
  amountAfterDiscountCents: number;
  totalDiscountCents: number;
  warnings: string[];
}

export function validateDiscountSchedule(
  discounts: ResolvedDiscount[],
): DiscountScheduleValidationError[] {
  const errors: DiscountScheduleValidationError[] = [];
  const sortOrders = new Map<number, string>();

  for (const discount of discounts) {
    if (discount.applicationPhase !== 'SUBTOTAL') continue;

    if (discount.kind === DiscountKind.PERCENTAGE) {
      if (discount.percentBps == null || discount.percentBps < 0 || discount.percentBps > 10_000) {
        errors.push({
          code: DiscountApplicationErrorCode.DISCOUNT_PERCENT_INVALID,
          discountId: discount.id,
        });
      }
    }

    if (discount.kind === DiscountKind.FIXED_AMOUNT) {
      if (discount.fixedAmountCents != null && discount.fixedAmountCents < 0) {
        errors.push({
          code: DiscountApplicationErrorCode.DISCOUNT_FIXED_NEGATIVE,
          discountId: discount.id,
        });
      }
    }

    if (sortOrders.has(discount.sortOrder)) {
      errors.push({
        code: DiscountApplicationErrorCode.DISCOUNT_DUPLICATE_SORT_ORDER,
        discountId: discount.id,
        relatedDiscountId: sortOrders.get(discount.sortOrder),
      });
    } else {
      sortOrders.set(discount.sortOrder, discount.id);
    }
  }

  return errors;
}

function isTemporallyValid(discount: ResolvedDiscount, asOf: Date): boolean {
  if (discount.validFrom > asOf) return false;
  if (discount.validTo != null && discount.validTo < asOf) return false;
  return true;
}

function matchesScope(
  discount: ResolvedDiscount,
  subscriptionItemId: string | null | undefined,
): boolean {
  if (!discount.subscriptionItemId) return true;
  if (!subscriptionItemId) return false;
  return discount.subscriptionItemId === subscriptionItemId;
}

function computeDiscountAmount(
  remainingCents: number,
  discount: ResolvedDiscount,
): number {
  if (discount.kind === DiscountKind.PERCENTAGE) {
    const bps = discount.percentBps ?? 0;
    return Math.round((remainingCents * bps) / 10_000);
  }

  const fixed = discount.fixedAmountCents ?? 0;
  return Math.min(fixed, remainingCents);
}

export function applyDiscounts(input: ApplyDiscountsInput): ApplyDiscountsResult {
  const asOf = input.asOf ?? new Date();
  const currency = input.currency.trim().toUpperCase();
  const warnings: string[] = [];
  const skippedDiscounts: SkippedDiscountLine[] = [];
  const appliedDiscounts: AppliedDiscountLine[] = [];
  const appliedIds = new Set<string>();

  let remainingCents = Math.max(0, input.baseAmountCents);

  const subtotalDiscounts = [...input.discounts]
    .filter((discount) => discount.applicationPhase === 'SUBTOTAL')
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.validFrom.getTime() - b.validFrom.getTime();
    });

  const scheduleErrors = validateDiscountSchedule(subtotalDiscounts);
  if (scheduleErrors.length > 0) {
    for (const error of scheduleErrors) {
      if (error.discountId) {
        skippedDiscounts.push({ discountId: error.discountId, code: error.code });
      }
    }
    return {
      baseAmountCents: input.baseAmountCents,
      appliedDiscounts: [],
      skippedDiscounts,
      amountAfterDiscountCents: remainingCents,
      totalDiscountCents: 0,
      warnings: scheduleErrors.map((error) => error.code),
    };
  }

  for (const discount of subtotalDiscounts) {
    if (appliedIds.has(discount.id)) {
      skippedDiscounts.push({
        discountId: discount.id,
        code: DiscountApplicationErrorCode.DISCOUNT_ALREADY_APPLIED,
      });
      continue;
    }

    if (!isTemporallyValid(discount, asOf)) {
      skippedDiscounts.push({
        discountId: discount.id,
        code:
          discount.validFrom > asOf
            ? DiscountApplicationErrorCode.DISCOUNT_NOT_YET_VALID
            : DiscountApplicationErrorCode.DISCOUNT_EXPIRED,
      });
      continue;
    }

    if (!matchesScope(discount, input.subscriptionItemId)) {
      skippedDiscounts.push({
        discountId: discount.id,
        code: DiscountApplicationErrorCode.DISCOUNT_SCOPE_MISMATCH,
      });
      continue;
    }

    if (discount.kind === DiscountKind.FIXED_AMOUNT) {
      const discountCurrency = discount.currency?.trim().toUpperCase() ?? null;
      if (!discountCurrency || discountCurrency !== currency) {
        skippedDiscounts.push({
          discountId: discount.id,
          code: DiscountApplicationErrorCode.DISCOUNT_CURRENCY_MISMATCH,
        });
        continue;
      }
      if (discount.fixedAmountCents == null || discount.fixedAmountCents < 0) {
        skippedDiscounts.push({
          discountId: discount.id,
          code: DiscountApplicationErrorCode.DISCOUNT_FIXED_NEGATIVE,
        });
        continue;
      }
    }

    if (discount.kind === DiscountKind.PERCENTAGE) {
      if (discount.percentBps == null || discount.percentBps < 0 || discount.percentBps > 10_000) {
        skippedDiscounts.push({
          discountId: discount.id,
          code: DiscountApplicationErrorCode.DISCOUNT_PERCENT_INVALID,
        });
        continue;
      }
    }

    if (remainingCents <= 0) {
      warnings.push('DISCOUNT_BASE_ALREADY_ZERO');
      break;
    }

    const appliedAmountCents = computeDiscountAmount(remainingCents, discount);
    if (appliedAmountCents <= 0) continue;

    remainingCents = Math.max(0, remainingCents - appliedAmountCents);
    appliedIds.add(discount.id);

    appliedDiscounts.push({
      discountId: discount.id,
      kind: discount.kind,
      percentBps: discount.percentBps,
      fixedAmountCents: discount.fixedAmountCents,
      appliedAmountCents,
      sortOrder: discount.sortOrder,
      reason: discount.reason,
      subscriptionItemId: discount.subscriptionItemId,
      validFrom: discount.validFrom,
      validTo: discount.validTo,
    });
  }

  const totalDiscountCents = input.baseAmountCents - remainingCents;

  return {
    baseAmountCents: input.baseAmountCents,
    appliedDiscounts,
    skippedDiscounts,
    amountAfterDiscountCents: remainingCents,
    totalDiscountCents,
    warnings,
  };
}
