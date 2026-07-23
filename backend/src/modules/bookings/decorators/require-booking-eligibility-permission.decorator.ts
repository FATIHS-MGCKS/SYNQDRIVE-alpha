import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import {
  BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS,
  type BookingEligibilityPermissionAction,
} from '../booking-eligibility-permission.constants';

/**
 * Declarative booking rental-eligibility capability for org-scoped routes.
 * Enforced by `PermissionsGuard` after `OrgScopingGuard`.
 */
export const RequireBookingEligibilityPermission = (action: BookingEligibilityPermissionAction) => {
  const requirement = BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS[action];
  return RequirePermission(requirement.module, requirement.level);
};
