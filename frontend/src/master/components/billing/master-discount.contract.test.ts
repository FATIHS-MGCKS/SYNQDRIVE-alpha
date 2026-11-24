import { describe, expect, it } from 'vitest';
import { DiscountKind } from '../../../lib/billing-domain';
import {
  percentToBps,
  summarizeMasterDiscountPayload,
  validateMasterAddDiscountInput,
} from './master-discount.contract';

const VALID_FROM = '2026-01-01T00:00:00.000Z';

describe('master-discount.contract', () => {
  it('maps percent to bps for PERCENTAGE discounts', () => {
    expect(percentToBps(10)).toBe(1000);
    expect(percentToBps(0.5)).toBe(50);
  });

  it('rejects non-canonical discountType values', () => {
    const result = validateMasterAddDiscountInput({
      discountType: 'PERCENT' as typeof DiscountKind.PERCENTAGE,
      percent: 10,
      validFrom: VALID_FROM,
    });
    expect(result.ok).toBe(false);
  });

  it('builds PERCENTAGE payload aligned with MasterSubscriptionAddDiscountDto', () => {
    const result = validateMasterAddDiscountInput({
      discountType: DiscountKind.PERCENTAGE,
      percent: 12.5,
      validFrom: VALID_FROM,
      reason: 'Partner',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.discountType).toBe('PERCENTAGE');
    expect(result.payload.percentBps).toBe(1250);
    expect(result.payload.fixedAmountCents).toBeUndefined();
  });

  it('builds FIXED_AMOUNT payload with EUR currency', () => {
    const result = validateMasterAddDiscountInput({
      discountType: DiscountKind.FIXED_AMOUNT,
      fixedAmount: 49.99,
      validFrom: VALID_FROM,
      validTo: '2026-06-01T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.fixedAmountCents).toBe(4999);
    expect(result.payload.currency).toBe('EUR');
  });

  it('enforces percent bounds', () => {
    expect(
      validateMasterAddDiscountInput({
        discountType: DiscountKind.PERCENTAGE,
        percent: 0,
        validFrom: VALID_FROM,
      }).ok,
    ).toBe(false);
    expect(
      validateMasterAddDiscountInput({
        discountType: DiscountKind.PERCENTAGE,
        percent: 101,
        validFrom: VALID_FROM,
      }).ok,
    ).toBe(false);
  });

  it('summarizes payload for confirmation UI', () => {
    const summary = summarizeMasterDiscountPayload({
      discountType: DiscountKind.PERCENTAGE,
      percentBps: 1000,
      validFrom: VALID_FROM,
    });
    expect(summary).toContain('10%');
  });
});