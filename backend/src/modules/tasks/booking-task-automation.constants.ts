/**
 * @deprecated Import from `@modules/tasks/automation/task-automation-rule.util` instead.
 * Re-exports preserved for backward-compatible import paths.
 */
export {
  activeRentalPhaseDedupKeys,
  bookingPickupDedupKey,
  bookingPreparationDedupKey,
  bookingReturnDedupKey,
  confirmedPhaseActiveDedupKeys,
  legacyConfirmedBookingDedupKeys,
  LEGACY_CONFIRMED_BOOKING_DEDUP_KEYS,
} from './automation/task-automation-rule.util';

import { getAutomationRuleByCatalogKey } from './automation/task-automation-rule.util';

const bookingPreparationRule = getAutomationRuleByCatalogKey('BOOKING_PREPARATION');
const bookingPickupRule = getAutomationRuleByCatalogKey('BOOKING_PICKUP');
const bookingReturnRule = getAutomationRuleByCatalogKey('BOOKING_RETURN');

/** Stable automation rule id for confirmed-booking preparation (Task Domain V2). */
export const BOOKING_PREPARATION_RULE_ID = bookingPreparationRule.ruleId;

export const BOOKING_PREPARATION_RULE_VERSION = bookingPreparationRule.version;

export const BOOKING_PICKUP_RULE_ID = bookingPickupRule.ruleId;

export const BOOKING_PICKUP_RULE_VERSION = bookingPickupRule.version;

export const BOOKING_RETURN_RULE_ID = bookingReturnRule.ruleId;

export const BOOKING_RETURN_RULE_VERSION = bookingReturnRule.version;
