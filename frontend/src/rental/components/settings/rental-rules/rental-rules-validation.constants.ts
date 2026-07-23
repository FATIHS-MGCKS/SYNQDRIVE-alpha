/** Mirrors backend RENTAL_RULES_VALIDATION_LIMITS for client-side hints. */
export const RENTAL_RULES_VALIDATION_LIMITS = {
  minimumAgeYears: { min: 18, max: 99 },
  minimumLicenseHoldingMonths: { min: 0, max: 971 },
  licenseHoldingWholeYears: { min: 0, max: 80 },
  licenseHoldingExtraMonths: { min: 0, max: 11 },
  depositMajorUnits: { min: 0, max: 100_000 },
  insuranceRequirement: { maxLength: 500 },
  notes: { maxLength: 2000 },
} as const;
