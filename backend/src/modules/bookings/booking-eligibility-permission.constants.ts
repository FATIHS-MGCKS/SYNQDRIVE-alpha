import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import type { PermissionModuleKey } from '@shared/auth/permission.constants';

/**
 * Stable permission codes for audit logs, documentation, and UI labels.
 */
export const BOOKING_ELIGIBILITY_PERMISSION_CODES = {
  REVIEW: 'BOOKING_ELIGIBILITY_REVIEW',
  OVERRIDE: 'BOOKING_ELIGIBILITY_OVERRIDE',
} as const;

export type BookingEligibilityPermissionCode =
  (typeof BOOKING_ELIGIBILITY_PERMISSION_CODES)[keyof typeof BOOKING_ELIGIBILITY_PERMISSION_CODES];

/**
 * Granular booking rental-eligibility actions (preview review + manual override).
 * Separate from Customer Eligibility (KYC) and Rental Rules configuration.
 */
export const BOOKING_ELIGIBILITY_PERMISSION_ACTIONS = [
  'booking_eligibility.review',
  'booking_eligibility.override',
] as const;

export type BookingEligibilityPermissionAction =
  (typeof BOOKING_ELIGIBILITY_PERMISSION_ACTIONS)[number];

export interface BookingEligibilityPermissionRequirement {
  module: PermissionModuleKey;
  level: PermissionLevel;
  code: BookingEligibilityPermissionCode;
}

/** Manual override uses a dedicated module — never implied by `booking-eligibility.read`. */
export const BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS: Readonly<
  Record<BookingEligibilityPermissionAction, BookingEligibilityPermissionRequirement>
> = {
  'booking_eligibility.review': {
    module: 'booking-eligibility',
    level: 'read',
    code: BOOKING_ELIGIBILITY_PERMISSION_CODES.REVIEW,
  },
  'booking_eligibility.override': {
    module: 'booking-eligibility-override',
    level: 'manage',
    code: BOOKING_ELIGIBILITY_PERMISSION_CODES.OVERRIDE,
  },
};

export function isBookingEligibilityPermissionAction(
  value: string,
): value is BookingEligibilityPermissionAction {
  return (BOOKING_ELIGIBILITY_PERMISSION_ACTIONS as readonly string[]).includes(value);
}
