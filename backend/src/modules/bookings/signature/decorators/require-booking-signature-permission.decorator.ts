import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import {
  BOOKING_SIGNATURE_PERMISSION_REQUIREMENTS,
  type BookingSignaturePermissionAction,
} from './booking-handover-signature-permission.constants';

export const RequireBookingSignaturePermission = (
  action: BookingSignaturePermissionAction,
) => {
  const req = BOOKING_SIGNATURE_PERMISSION_REQUIREMENTS[action];
  return RequirePermission(req.module, req.level);
};
