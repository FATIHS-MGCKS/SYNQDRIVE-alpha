/**
 * Server-side field limits for rental rules (organization defaults, categories, vehicle overrides).
 * Frontend validation may mirror these; backend is authoritative.
 */
export const RENTAL_RULES_VALIDATION_LIMITS = {
  minimumAgeYears: { min: 18, max: 99 },
  minimumLicenseHoldingMonths: { min: 0, max: 971 }, // 80 years + 11 months
  minimumLicenseHoldingYearsAlias: { min: 0, max: 80 },
  depositAmountCents: { min: 0, max: 10_000_000 }, // 100,000.00 major units
  depositCurrency: { length: 3 },
  insuranceRequirement: { maxLength: 500 },
  notes: { maxLength: 2000 },
  categoryName: { minLength: 1, maxLength: 80 },
  categoryDescription: { maxLength: 500 },
  categoryColor: { maxLength: 32 },
  categoryIcon: { maxLength: 64 },
  vehicleAssignmentIds: { maxCount: 500 },
  resetOverrideFields: { maxCount: 20 },
} as const;

export const RENTAL_RULES_VALIDATION_MESSAGE_KEYS = {
  minimumAgeYears: {
    int: 'rentalRules.validation.minimumAgeYears.int',
    min: 'rentalRules.validation.minimumAgeYears.min',
    max: 'rentalRules.validation.minimumAgeYears.max',
  },
  minimumLicenseHoldingMonths: {
    int: 'rentalRules.validation.minimumLicenseHoldingMonths.int',
    min: 'rentalRules.validation.minimumLicenseHoldingMonths.min',
    max: 'rentalRules.validation.minimumLicenseHoldingMonths.max',
  },
  minimumLicenseHoldingYears: {
    int: 'rentalRules.validation.minimumLicenseHoldingYears.int',
    min: 'rentalRules.validation.minimumLicenseHoldingYears.min',
    max: 'rentalRules.validation.minimumLicenseHoldingYears.max',
  },
  depositAmountCents: {
    int: 'rentalRules.validation.depositAmountCents.int',
    min: 'rentalRules.validation.depositAmountCents.min',
    max: 'rentalRules.validation.depositAmountCents.max',
  },
  depositAmount: {
    int: 'rentalRules.validation.depositAmount.int',
    min: 'rentalRules.validation.depositAmount.min',
    max: 'rentalRules.validation.depositAmount.max',
  },
  depositCurrency: {
    iso4217: 'rentalRules.validation.depositCurrency.iso4217',
    length: 'rentalRules.validation.depositCurrency.length',
  },
  insuranceRequirement: {
    maxLength: 'rentalRules.validation.insuranceRequirement.maxLength',
  },
  notes: {
    maxLength: 'rentalRules.validation.notes.maxLength',
  },
  categoryName: {
    required: 'rentalRules.validation.categoryName.required',
    maxLength: 'rentalRules.validation.categoryName.maxLength',
  },
  categoryDescription: {
    maxLength: 'rentalRules.validation.categoryDescription.maxLength',
  },
  categoryColor: {
    maxLength: 'rentalRules.validation.categoryColor.maxLength',
  },
  categoryIcon: {
    maxLength: 'rentalRules.validation.categoryIcon.maxLength',
  },
  vehicleIds: {
    uuid: 'rentalRules.validation.vehicleIds.uuid',
    maxSize: 'rentalRules.validation.vehicleIds.maxSize',
    unique: 'rentalRules.validation.vehicleIds.unique',
    notEmpty: 'rentalRules.validation.vehicleIds.notEmpty',
  },
  resetFields: {
    invalid: 'rentalRules.validation.resetFields.invalid',
    maxSize: 'rentalRules.validation.resetFields.maxSize',
  },
  enum: {
    invalid: 'rentalRules.validation.enum.invalid',
  },
  boolean: {
    invalid: 'rentalRules.validation.boolean.invalid',
  },
} as const;

/** Skip class-validator checks when PATCH sends explicit null (inherit/clear). */
export function isRentalRuleSetValue(value: unknown): boolean {
  return value !== null && value !== undefined;
}
