import { describe, expect, it } from 'vitest';
import {
  extractRulePatchBaseline,
  formValuesToPatchPayload,
  rulesToFormValues,
} from './rental-rules.utils';
import type { RentalRuleFormValues, RentalVehicleCategoryDto } from './rental-rules.types';
import { combineLicenseHoldingMonths } from './license-holding.util';

const baselineCategory = {
  minimumAgeYears: 25,
  minimumLicenseHoldingMonths: 24,
  depositAmountCents: 50000,
  depositCurrency: 'EUR',
  creditCardRequired: true,
  foreignTravelPolicy: 'APPROVAL_REQUIRED',
  additionalDriverPolicy: 'ALLOWED',
  youngDriverPolicy: 'FEE_REQUIRED',
  insuranceRequirement: 'Full cover',
  manualApprovalRequired: false,
  notes: 'Station note',
} as RentalVehicleCategoryDto;

function emptyForm(): RentalRuleFormValues {
  return rulesToFormValues(null);
}

describe('rental-rules.utils patch payload', () => {
  it('create mode only sends explicitly set values', () => {
    const values = rulesToFormValues({
      minimumAgeYears: 21,
      creditCardRequired: false,
    });
    const payload = formValuesToPatchPayload(values, null, 'create');

    expect(payload).toEqual({
      minimumAgeYears: 21,
      creditCardRequired: false,
    });
  });

  it('edit mode omits unchanged fields', () => {
    const values = rulesToFormValues(baselineCategory);
    const payload = formValuesToPatchPayload(values, baselineCategory, 'edit');
    expect(payload).toEqual({});
  });

  it('edit mode sends null when field is cleared to inherit', () => {
    const values = rulesToFormValues(baselineCategory);
    values.minimumAgeYears = '';
    values.foreignTravelPolicy = '';
    values.insuranceRequirement = '';

    const payload = formValuesToPatchPayload(values, baselineCategory, 'edit');

    expect(payload).toEqual({
      minimumAgeYears: null,
      foreignTravelPolicy: null,
      insuranceRequirement: null,
    });
  });

  it('edit mode preserves explicit false and does not treat it as inherit', () => {
    const base = {
      ...baselineCategory,
      creditCardRequired: true,
      manualApprovalRequired: true,
    };
    const values = rulesToFormValues(base);
    values.creditCardRequired = 'false';
    values.manualApprovalRequired = 'false';

    const payload = formValuesToPatchPayload(values, base, 'edit');

    expect(payload).toEqual({
      creditCardRequired: false,
      manualApprovalRequired: false,
    });
  });

  it('edit mode sends null for deposit currency when cleared', () => {
    const values = rulesToFormValues(baselineCategory);
    values.depositCurrency = '';

    const payload = formValuesToPatchPayload(values, baselineCategory, 'edit');
    expect(payload.depositCurrency).toBeNull();
  });

  it('extractRulePatchBaseline trims text fields and normalizes currency', () => {
    const baseline = extractRulePatchBaseline({
      depositCurrency: ' eur ',
      insuranceRequirement: '  liability ',
      notes: '',
    });

    expect(baseline.depositCurrency).toBe('EUR');
    expect(baseline.insuranceRequirement).toBe('liability');
    expect(baseline.notes).toBeNull();
  });

  it('create mode does not send empty strings as values', () => {
    const payload = formValuesToPatchPayload(emptyForm(), null, 'create');
    expect(payload).toEqual({});
  });

  it.each([
    [18, '1', '6'],
    [6, '', '6'],
    [24, '2', ''],
  ])('roundtrips %i months through form without drift', (months, years, extraMonths) => {
    const values = rulesToFormValues({ minimumLicenseHoldingMonths: months });
    expect(values.licenseHoldingWholeYears).toBe(years);
    expect(values.licenseHoldingExtraMonths).toBe(extraMonths);

    const payload = formValuesToPatchPayload(values, { minimumLicenseHoldingMonths: months }, 'edit');
    expect(payload).toEqual({});
  });

  it('preserves non-whole-year month values on save', () => {
    const baseline = { minimumLicenseHoldingMonths: 18 };
    const values = rulesToFormValues(baseline);
    values.licenseHoldingWholeYears = '1';
    values.licenseHoldingExtraMonths = '6';

    const payload = formValuesToPatchPayload(values, baseline, 'edit');
    expect(payload).toEqual({});
    expect(
      formValuesToPatchPayload(values, { minimumLicenseHoldingMonths: 17 }, 'edit'),
    ).toEqual({ minimumLicenseHoldingMonths: 18 });
    expect(combineLicenseHoldingMonths(1, 6)).toBe(18);
  });
});
