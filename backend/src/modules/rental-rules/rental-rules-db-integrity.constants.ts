/** Database CHECK constraint bounds — must match rental-rules-validation.constants.ts */
export const RENTAL_RULES_DB_LIMITS = {
  minimumAgeYears: { min: 18, max: 99 },
  minimumLicenseHoldingMonths: { min: 0, max: 971 },
  depositAmountCents: { min: 0, max: 10_000_000 },
  insuranceRequirementMaxLength: 500,
  notesMaxLength: 2000,
  categoryNameMaxLength: 80,
} as const;

export const RENTAL_RULES_INTEGRITY_MIGRATION_ID = '20260723100000_rental_rules_db_integrity';
