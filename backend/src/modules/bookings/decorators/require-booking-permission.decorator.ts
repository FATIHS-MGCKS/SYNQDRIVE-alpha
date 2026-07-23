import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import {
  BOOKING_PERMISSION_REQUIREMENTS,
  type BookingPermissionAction,
} from '../booking-permission.constants';

/**
 * Declarative booking capability for org-scoped booking routes.
 * Enforced by `PermissionsGuard` after `OrgScopingGuard`.
 *
 * Example: `@RequireBookingPermission('booking.read')`
 */
export const RequireBookingPermission = (action: BookingPermissionAction) => {
  const requirement = BOOKING_PERMISSION_REQUIREMENTS[action];
  return RequirePermission(requirement.module, requirement.level);
};
