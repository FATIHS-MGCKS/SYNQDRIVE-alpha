import { applyDecorators, SetMetadata } from '@nestjs/common';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import {
  BOOKING_PERMISSION_REQUIREMENTS,
  type BookingPermissionAction,
} from '../booking-permission.constants';

/** Metadata key — `BookingPermissionsGuard` requires this on every handler. */
export const BOOKING_PERMISSION_KEY = 'booking_permission_action';

/**
 * Declarative booking capability for org-scoped booking routes.
 * Enforced by `BookingPermissionsGuard` after `OrgScopingGuard`.
 *
 * Example: `@RequireBookingPermission('booking.read')`
 */
export const RequireBookingPermission = (action: BookingPermissionAction) => {
  const requirement = BOOKING_PERMISSION_REQUIREMENTS[action];
  return applyDecorators(
    SetMetadata(BOOKING_PERMISSION_KEY, action),
    RequirePermission(requirement.module, requirement.level),
  );
};
