import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import {
  BOOKING_LEGAL_ACCEPTANCE_PERMISSION_REQUIREMENTS,
  type BookingLegalAcceptancePermissionAction,
} from '../booking-legal-acceptance-permission.constants';

export const RequireBookingLegalAcceptancePermission = (
  action: BookingLegalAcceptancePermissionAction,
) => {
  const req = BOOKING_LEGAL_ACCEPTANCE_PERMISSION_REQUIREMENTS[action];
  return RequirePermission(req.module, req.level);
};
