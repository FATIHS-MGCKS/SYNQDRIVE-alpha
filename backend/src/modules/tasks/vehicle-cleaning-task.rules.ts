import {
  getAutomationRuleByCatalogKey,
  getConfigurableNumberDefault,
  LEGACY_BOOKING_CLEAN_DEDUP_PREFIX,
  VEHICLE_CLEANING_TASK_DEDUP_PREFIX,
} from '@modules/tasks/automation/task-automation-rule.util';

const vehicleCleaningRule = getAutomationRuleByCatalogKey('VEHICLE_CLEANING_REQUIRED');

/** Canonical dedup prefix — identity is vehicle + preparation window, not booking. */
export { VEHICLE_CLEANING_TASK_DEDUP_PREFIX, LEGACY_BOOKING_CLEAN_DEDUP_PREFIX };

export const VEHICLE_CLEANING_RULE_ID = vehicleCleaningRule.ruleId;

export const VEHICLE_CLEANING_RULE_VERSION = vehicleCleaningRule.version;

/** Fachliche Reinigungszwecke — bestimmen den Vorbereitungsfenster-Suffix im dedupKey. */
export type CleaningPurpose = 'PRE_BOOKING' | 'STANDALONE';

/** Aktuell ein relevantes Vorbereitungsfenster: Reinigung vor nächster Buchung. */
export type PreparationWindow = 'PRE_BOOKING';

/** Hours before next pickup when cleaning priority escalates to HIGH. */
export const VEHICLE_CLEANING_URGENT_BEFORE_PICKUP_HOURS = getConfigurableNumberDefault(
  vehicleCleaningRule,
  'urgentBeforePickupHours',
  24,
);
