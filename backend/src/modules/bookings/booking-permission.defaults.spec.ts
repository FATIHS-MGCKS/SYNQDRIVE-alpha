import { evaluateModulePermission, normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import {
  bookingDriverPermissions,
  bookingFieldAgentPermissions,
  bookingFullPermissions,
} from './booking-permission.defaults';
import {
  BOOKING_PERMISSION_ACTIONS,
  BOOKING_PERMISSION_REQUIREMENTS,
} from './booking-permission.constants';
import { evaluateOperationalPermission } from '@shared/auth/operational-permission.util';

describe('booking-permission.defaults', () => {
  it('maps full permissions to all booking actions', () => {
    const perms = normalizeMembershipPermissions(bookingFullPermissions());
    for (const action of BOOKING_PERMISSION_ACTIONS) {
      const requirement = BOOKING_PERMISSION_REQUIREMENTS[action];
      expect(evaluateModulePermission(perms, requirement.module, requirement.level)).toBe(true);
    }
  });

  it('driver template denies sensitive, finance and signature reads', () => {
    const perms = normalizeMembershipPermissions(bookingDriverPermissions());
    expect(evaluateOperationalPermission(perms, 'booking.read')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'booking.create')).toBe(false);
    expect(evaluateOperationalPermission(perms, 'booking.read_sensitive')).toBe(false);
    expect(evaluateOperationalPermission(perms, 'booking.finance.read')).toBe(false);
    expect(evaluateOperationalPermission(perms, 'booking.signature.read')).toBe(false);
    expect(evaluateOperationalPermission(perms, 'booking.handover.read')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'booking.handover.perform')).toBe(false);
  });

  it('field agent can perform handover but not manage finance', () => {
    const perms = normalizeMembershipPermissions(bookingFieldAgentPermissions());
    expect(evaluateOperationalPermission(perms, 'booking.handover.perform')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'booking.documents.read')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'booking.finance.read')).toBe(false);
    expect(evaluateOperationalPermission(perms, 'booking.create')).toBe(false);
  });

  it('grants org_admin template full booking access', () => {
    const orgAdmin = DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((t) => t.systemKey === 'org_admin');
    const perms = normalizeMembershipPermissions(orgAdmin?.permissions);
    expect(evaluateModulePermission(perms, 'bookings', 'manage')).toBe(true);
    expect(evaluateModulePermission(perms, 'bookings-finance', 'write')).toBe(true);
    expect(evaluateModulePermission(perms, 'bookings-audit', 'read')).toBe(true);
  });

  it('grants disposition write on schedule/customer without sensitive read', () => {
    const disposition = DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find(
      (t) => t.systemKey === 'disposition',
    );
    const perms = normalizeMembershipPermissions(disposition?.permissions);
    expect(evaluateOperationalPermission(perms, 'booking.create')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'booking.update_schedule')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'booking.read_sensitive')).toBe(false);
    expect(evaluateOperationalPermission(perms, 'booking.complete')).toBe(false);
  });

  it('exposes stable permission codes for each action', () => {
    expect(BOOKING_PERMISSION_REQUIREMENTS['booking.read'].code).toBe('BOOKING_READ');
    expect(BOOKING_PERMISSION_REQUIREMENTS['booking.override'].code).toBe('BOOKING_OVERRIDE');
    expect(BOOKING_PERMISSION_REQUIREMENTS['booking.signature.read'].code).toBe(
      'BOOKING_SIGNATURE_READ',
    );
  });
});
