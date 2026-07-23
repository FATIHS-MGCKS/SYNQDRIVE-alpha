import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import type { PermissionModuleKey } from '@shared/auth/permission.constants';

/**
 * Stable permission codes for audit logs, documentation, and UI labels.
 * Enforced server-side via mapped module+level membership JSON.
 */
export const BOOKING_PERMISSION_CODES = {
  READ: 'BOOKING_READ',
  READ_SENSITIVE: 'BOOKING_READ_SENSITIVE',
  CREATE: 'BOOKING_CREATE',
  UPDATE: 'BOOKING_UPDATE',
  UPDATE_SCHEDULE: 'BOOKING_UPDATE_SCHEDULE',
  UPDATE_CUSTOMER: 'BOOKING_UPDATE_CUSTOMER',
  UPDATE_VEHICLE: 'BOOKING_UPDATE_VEHICLE',
  UPDATE_STATIONS: 'BOOKING_UPDATE_STATIONS',
  UPDATE_NOTES: 'BOOKING_UPDATE_NOTES',
  UPDATE_OPTIONS: 'BOOKING_UPDATE_OPTIONS',
  UPDATE_ALLOWED_DRIVERS: 'BOOKING_UPDATE_ALLOWED_DRIVERS',
  CANCEL: 'BOOKING_CANCEL',
  CONFIRM: 'BOOKING_CONFIRM',
  MARK_NO_SHOW: 'BOOKING_MARK_NO_SHOW',
  COMPLETE: 'BOOKING_COMPLETE',
  OVERRIDE: 'BOOKING_OVERRIDE',
  FINANCE_READ: 'BOOKING_FINANCE_READ',
  FINANCE_MANAGE: 'BOOKING_FINANCE_MANAGE',
  DOCUMENTS_READ: 'BOOKING_DOCUMENTS_READ',
  DOCUMENTS_MANAGE: 'BOOKING_DOCUMENTS_MANAGE',
  HANDOVER_READ: 'BOOKING_HANDOVER_READ',
  HANDOVER_PERFORM: 'BOOKING_HANDOVER_PERFORM',
  SIGNATURE_READ: 'BOOKING_SIGNATURE_READ',
  AUDIT_READ: 'BOOKING_AUDIT_READ',
} as const;

export type BookingPermissionCode =
  (typeof BOOKING_PERMISSION_CODES)[keyof typeof BOOKING_PERMISSION_CODES];

/**
 * Canonical booking permission actions for the rental booking domain.
 * Mapped to `{ module, read|write|manage }` membership JSON (payments/tasks pattern).
 */
export const BOOKING_PERMISSION_ACTIONS = [
  'booking.read',
  'booking.read_sensitive',
  'booking.create',
  'booking.update',
  'booking.update_schedule',
  'booking.update_customer',
  'booking.update_vehicle',
  'booking.update_stations',
  'booking.update_notes',
  'booking.update_options',
  'booking.update_allowed_drivers',
  'booking.cancel',
  'booking.confirm',
  'booking.mark_no_show',
  'booking.complete',
  'booking.override',
  'booking.finance.read',
  'booking.finance.manage',
  'booking.documents.read',
  'booking.documents.manage',
  'booking.handover.read',
  'booking.handover.perform',
  'booking.signature.read',
  'booking.audit.read',
] as const;

export type BookingPermissionAction =
  (typeof BOOKING_PERMISSION_ACTIONS)[number];

export interface BookingPermissionRequirement {
  module: PermissionModuleKey;
  level: PermissionLevel;
  code: BookingPermissionCode;
}

export const BOOKING_PERMISSION_REQUIREMENTS: Readonly<
  Record<BookingPermissionAction, BookingPermissionRequirement>
> = {
  'booking.read': {
    module: 'bookings',
    level: 'read',
    code: BOOKING_PERMISSION_CODES.READ,
  },
  'booking.read_sensitive': {
    module: 'bookings-sensitive',
    level: 'read',
    code: BOOKING_PERMISSION_CODES.READ_SENSITIVE,
  },
  'booking.create': {
    module: 'bookings',
    level: 'write',
    code: BOOKING_PERMISSION_CODES.CREATE,
  },
  'booking.update': {
    module: 'bookings',
    level: 'write',
    code: BOOKING_PERMISSION_CODES.UPDATE,
  },
  'booking.update_schedule': {
    module: 'bookings-schedule',
    level: 'write',
    code: BOOKING_PERMISSION_CODES.UPDATE_SCHEDULE,
  },
  'booking.update_customer': {
    module: 'bookings-customer',
    level: 'write',
    code: BOOKING_PERMISSION_CODES.UPDATE_CUSTOMER,
  },
  'booking.update_vehicle': {
    module: 'bookings-vehicle',
    level: 'write',
    code: BOOKING_PERMISSION_CODES.UPDATE_VEHICLE,
  },
  'booking.update_stations': {
    module: 'bookings-schedule',
    level: 'write',
    code: BOOKING_PERMISSION_CODES.UPDATE_STATIONS,
  },
  'booking.update_notes': {
    module: 'bookings',
    level: 'write',
    code: BOOKING_PERMISSION_CODES.UPDATE_NOTES,
  },
  'booking.update_options': {
    module: 'bookings-finance',
    level: 'write',
    code: BOOKING_PERMISSION_CODES.UPDATE_OPTIONS,
  },
  'booking.update_allowed_drivers': {
    module: 'bookings-customer',
    level: 'write',
    code: BOOKING_PERMISSION_CODES.UPDATE_ALLOWED_DRIVERS,
  },
  'booking.cancel': {
    module: 'bookings',
    level: 'write',
    code: BOOKING_PERMISSION_CODES.CANCEL,
  },
  'booking.confirm': {
    module: 'bookings',
    level: 'write',
    code: BOOKING_PERMISSION_CODES.CONFIRM,
  },
  'booking.mark_no_show': {
    module: 'bookings',
    level: 'write',
    code: BOOKING_PERMISSION_CODES.MARK_NO_SHOW,
  },
  'booking.complete': {
    module: 'bookings',
    level: 'manage',
    code: BOOKING_PERMISSION_CODES.COMPLETE,
  },
  'booking.override': {
    module: 'bookings',
    level: 'manage',
    code: BOOKING_PERMISSION_CODES.OVERRIDE,
  },
  'booking.finance.read': {
    module: 'bookings-finance',
    level: 'read',
    code: BOOKING_PERMISSION_CODES.FINANCE_READ,
  },
  'booking.finance.manage': {
    module: 'bookings-finance',
    level: 'write',
    code: BOOKING_PERMISSION_CODES.FINANCE_MANAGE,
  },
  'booking.documents.read': {
    module: 'bookings-documents',
    level: 'read',
    code: BOOKING_PERMISSION_CODES.DOCUMENTS_READ,
  },
  'booking.documents.manage': {
    module: 'bookings-documents',
    level: 'write',
    code: BOOKING_PERMISSION_CODES.DOCUMENTS_MANAGE,
  },
  'booking.handover.read': {
    module: 'bookings-handover',
    level: 'read',
    code: BOOKING_PERMISSION_CODES.HANDOVER_READ,
  },
  'booking.handover.perform': {
    module: 'bookings-handover',
    level: 'write',
    code: BOOKING_PERMISSION_CODES.HANDOVER_PERFORM,
  },
  'booking.signature.read': {
    module: 'bookings-sensitive',
    level: 'read',
    code: BOOKING_PERMISSION_CODES.SIGNATURE_READ,
  },
  'booking.audit.read': {
    module: 'bookings-audit',
    level: 'read',
    code: BOOKING_PERMISSION_CODES.AUDIT_READ,
  },
};

export function isBookingPermissionAction(
  value: string,
): value is BookingPermissionAction {
  return (BOOKING_PERMISSION_ACTIONS as readonly string[]).includes(value);
}
