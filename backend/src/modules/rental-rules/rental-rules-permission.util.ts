import {
  evaluateModulePermission,
  type MembershipPermissionsMap,
} from '@shared/auth/permission.util';
import {
  BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS,
  type BookingEligibilityPermissionAction,
} from '@modules/bookings/booking-eligibility-permission.constants';
import {
  RENTAL_RULE_PERMISSION_REQUIREMENTS,
  type RentalRulePermissionAction,
} from './rental-rules-permission.constants';

/**
 * Evaluates a granular rental-rules permission action against normalized membership JSON.
 */
export function evaluateRentalRulePermission(
  permissions: MembershipPermissionsMap | null,
  action: RentalRulePermissionAction,
): boolean {
  const requirement = RENTAL_RULE_PERMISSION_REQUIREMENTS[action];
  return evaluateModulePermission(permissions, requirement.module, requirement.level);
}

/**
 * Evaluates a granular booking rental-eligibility permission action.
 */
export function evaluateBookingEligibilityPermission(
  permissions: MembershipPermissionsMap | null,
  action: BookingEligibilityPermissionAction,
): boolean {
  const requirement = BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS[action];
  return evaluateModulePermission(permissions, requirement.module, requirement.level);
}
