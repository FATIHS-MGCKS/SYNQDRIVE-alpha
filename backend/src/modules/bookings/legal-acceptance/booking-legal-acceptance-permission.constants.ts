import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import type { PermissionModuleKey } from '@shared/auth/permission.constants';

export const BOOKING_LEGAL_ACCEPTANCE_PERMISSION_CODES = {
  READ: 'BOOKING_LEGAL_ACCEPTANCE_READ',
  RECORD: 'BOOKING_LEGAL_ACCEPTANCE_RECORD',
} as const;

export const BOOKING_LEGAL_ACCEPTANCE_PERMISSION_ACTIONS = [
  'booking_legal_acceptance.read',
  'booking_legal_acceptance.record',
] as const;

export type BookingLegalAcceptancePermissionAction =
  (typeof BOOKING_LEGAL_ACCEPTANCE_PERMISSION_ACTIONS)[number];

export interface BookingLegalAcceptancePermissionRequirement {
  module: PermissionModuleKey;
  level: PermissionLevel;
  code: (typeof BOOKING_LEGAL_ACCEPTANCE_PERMISSION_CODES)[keyof typeof BOOKING_LEGAL_ACCEPTANCE_PERMISSION_CODES];
}

export const BOOKING_LEGAL_ACCEPTANCE_PERMISSION_REQUIREMENTS: Readonly<
  Record<BookingLegalAcceptancePermissionAction, BookingLegalAcceptancePermissionRequirement>
> = {
  'booking_legal_acceptance.read': {
    module: 'legal-documents-audit',
    level: 'read',
    code: BOOKING_LEGAL_ACCEPTANCE_PERMISSION_CODES.READ,
  },
  'booking_legal_acceptance.record': {
    module: 'bookings',
    level: 'write',
    code: BOOKING_LEGAL_ACCEPTANCE_PERMISSION_CODES.RECORD,
  },
};
