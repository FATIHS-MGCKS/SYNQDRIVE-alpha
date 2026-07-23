export const RENTAL_RULES_VERSION_CONFLICT_CODE = 'RENTAL_RULES_VERSION_CONFLICT' as const;

export type RentalRulesConcurrencyEntityType =
  | 'organization_default'
  | 'category'
  | 'vehicle_override';

export const RENTAL_RULES_CONCURRENCY_MIGRATION_ID =
  '20260723110000_rental_rules_optimistic_concurrency';

/** Sentinel version when no persisted row exists yet (first write). */
export const RENTAL_RULES_INITIAL_EXPECTED_VERSION = 0;
