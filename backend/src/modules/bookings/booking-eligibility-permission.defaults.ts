import type { MembershipPermissionsMap } from '@shared/auth/permission.util';

const all = (read: boolean, write: boolean, manage = false) => ({ read, write, manage });

/** Full booking rental-eligibility review and manual override. */
export function bookingEligibilityFullPermissions(): MembershipPermissionsMap {
  return {
    'booking-eligibility': all(true, false, false),
    'booking-eligibility-override': all(true, false, true),
  };
}

/** Review eligibility preview/results without manual override authority. */
export function bookingEligibilityReviewerPermissions(): MembershipPermissionsMap {
  return {
    'booking-eligibility': all(true, false, false),
    'booking-eligibility-override': all(false, false, false),
  };
}

/** Manual override only (e.g. senior operator with existing review via bookings.read). */
export function bookingEligibilityOverridePermissions(): MembershipPermissionsMap {
  return {
    'booking-eligibility': all(true, false, false),
    'booking-eligibility-override': all(true, false, true),
  };
}
