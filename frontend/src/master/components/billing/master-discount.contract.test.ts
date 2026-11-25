import { describe, expect, it } from 'vitest';
import { DiscountKind } from '../../../lib/billing-domain';
import {
  parseDateTimeLocalInput,
  parsePercentInput,
  summarizeMasterDiscountPayload,
  validateMasterAddDiscountForm,
} from './master-discount.contract';

describe('master-discount.contract', () => {
  it('parses percent decimals with comma', () => {
    expect(parsePercentInput('12,5')).toBe(12.5);
  });

  it('rejects partially parsed numbers such as 10abc', () => {
    expect(parsePercentInput('10abc')).toBeNull();
    expect(parsePercentInput('12.5.1')).toBeNull();
  });

  it('rejects non-finite decimal strings', () => {
    expect(parsePercentInput('Infinity')).toBeNull();
    expect(parsePercentInput('NaN')).toBeNull();
  });

  it('enforces percent boundaries', () => {
    expect(
      validateMasterAddDiscountForm({
        discountType: DiscountKind.PERCENTAGE,
        percentInput: '0',
        reason: 'Boundary test',
      }).ok,
    ).toBe(false);
    expect(
      validateMasterAddDiscountForm({
        discountType: DiscountKind.PERCENTAGE,
        percentInput: '100.01',
        reason: 'Boundary test',
      }).ok,
    ).toBe(false);
    expect(
      validateMasterAddDiscountForm({
        discountType: DiscountKind.PERCENTAGE,
        percentInput: '-5',
        reason: 'Boundary test',
      }).ok,
    ).toBe(false);
  });

  it('rejects invalid fixed-amount suffixes and negative values', () => {
    expect(
      validateMasterAddDiscountForm({
        discountType: DiscountKind.FIXED_AMOUNT,
        fixedAmountInput: '25,00eur',
        reason: 'Invalid suffix',
      }).ok,
    ).toBe(false);
    expect(
      validateMasterAddDiscountForm({
        discountType: DiscountKind.FIXED_AMOUNT,
        fixedAmountInput: '-1',
        reason: 'Negative amount',
      }).ok,
    ).toBe(false);
  });

  it('rejects non-canonical discount types', () => {
    const result = validateMasterAddDiscountForm({
      discountType: 'PERCENT' as typeof DiscountKind.PERCENTAGE,
      percentInput: '10',
      reason: 'Partner program',
    });
    expect(result.ok).toBe(false);
  });

  it('requires auditable reason', () => {
    const result = validateMasterAddDiscountForm({
      discountType: DiscountKind.PERCENTAGE,
      percentInput: '10',
      reason: 'ab',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('MISSING_REASON');
  });

  it('does not throw on invalid datetime-local strings', () => {
    expect(parseDateTimeLocalInput('not-a-date')).toBeNull();
    const result = validateMasterAddDiscountForm({
      discountType: DiscountKind.PERCENTAGE,
      percentInput: '5',
      validFromLocal: 'not-a-date',
      reason: 'Valid audit reason',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('INVALID_VALID_FROM');
  });

  it('builds PERCENTAGE payload aligned with MasterSubscriptionAddDiscountDto', () => {
    const result = validateMasterAddDiscountForm({
      discountType: DiscountKind.PERCENTAGE,
      percentInput: '12.5',
      reason: 'Partner onboarding',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.discountType).toBe('PERCENTAGE');
    expect(result.payload.percentBps).toBe(1250);
    expect(result.payload.reason).toBe('Partner onboarding');
  });

  it('builds FIXED_AMOUNT payload with euro precision', () => {
    const result = validateMasterAddDiscountForm({
      discountType: DiscountKind.FIXED_AMOUNT,
      fixedAmountInput: '49,99',
      reason: 'One-time credit',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.fixedAmountCents).toBe(4999);
    expect(result.payload.currency).toBe('EUR');
  });

  it('summarizes descriptive preview (not invoice calculation)', () => {
    const summary = summarizeMasterDiscountPayload({
      discountType: DiscountKind.PERCENTAGE,
      percentBps: 1000,
      validFrom: new Date().toISOString(),
      reason: 'Partner',
    });
    expect(summary).toContain('Partner');
    expect(summary).toContain('10%');
  });
});