import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import type { PermissionModuleKey } from '@shared/auth/permission.constants';

export const BOOKING_SIGNATURE_PERMISSION_CODES = {
  READ: 'BOOKING_SIGNATURE_READ',
} as const;

export const BOOKING_SIGNATURE_PERMISSION_ACTIONS = [
  'booking.signature.read',
] as const;

export type BookingSignaturePermissionAction =
  (typeof BOOKING_SIGNATURE_PERMISSION_ACTIONS)[number];

export interface BookingSignaturePermissionRequirement {
  module: PermissionModuleKey;
  level: PermissionLevel;
  code: (typeof BOOKING_SIGNATURE_PERMISSION_CODES)[keyof typeof BOOKING_SIGNATURE_PERMISSION_CODES];
}

export const BOOKING_SIGNATURE_PERMISSION_REQUIREMENTS: Readonly<
  Record<BookingSignaturePermissionAction, BookingSignaturePermissionRequirement>
> = {
  'booking.signature.read': {
    module: 'legal-documents-audit',
    level: 'read',
    code: BOOKING_SIGNATURE_PERMISSION_CODES.READ,
  },
};
