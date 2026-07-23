import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import {
  evaluateModulePermission,
  normalizeMembershipPermissions,
  type MembershipPermissionsMap,
} from '@shared/auth/permission.util';
import {
  BOOKING_PERMISSION_ACTIONS,
  type BookingPermissionAction,
} from './booking-permission.constants';
import { evaluateOperationalPermission } from '@shared/auth/operational-permission.util';

type BookingCapability = BookingPermissionAction;

function capabilityGranted(
  permissions: MembershipPermissionsMap | null,
  capability: BookingCapability,
): boolean {
  return evaluateOperationalPermission(permissions, capability);
}

const templateByKey = (systemKey: string) =>
  DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((template) => template.systemKey === systemKey)!;

describe('Booking permissions matrix — organization role templates', () => {
  const cases: Array<{
    label: string;
    systemKey: string;
    expected: Partial<Record<BookingCapability, boolean>>;
  }> = [
    {
      label: 'Org Admin',
      systemKey: 'org_admin',
      expected: {
        'booking.read': true,
        'booking.read_sensitive': true,
        'booking.create': true,
        'booking.cancel': true,
        'booking.complete': true,
        'booking.override': true,
        'booking.finance.manage': true,
        'booking.documents.manage': true,
        'booking.handover.perform': true,
        'booking.audit.read': true,
      },
    },
    {
      label: 'Sub Admin',
      systemKey: 'sub_admin',
      expected: {
        'booking.read': true,
        'booking.read_sensitive': true,
        'booking.create': true,
        'booking.cancel': true,
        'booking.complete': false,
        'booking.override': false,
        'booking.finance.read': true,
        'booking.finance.manage': false,
        'booking.audit.read': true,
      },
    },
    {
      label: 'Disposition',
      systemKey: 'disposition',
      expected: {
        'booking.read': true,
        'booking.create': true,
        'booking.update_schedule': true,
        'booking.read_sensitive': false,
        'booking.finance.manage': false,
        'booking.handover.perform': false,
        'booking.audit.read': false,
      },
    },
    {
      label: 'Accounting',
      systemKey: 'accounting',
      expected: {
        'booking.read': true,
        'booking.create': false,
        'booking.finance.read': true,
        'booking.finance.manage': true,
        'booking.audit.read': true,
        'booking.handover.perform': false,
      },
    },
    {
      label: 'Station Manager',
      systemKey: 'station_manager',
      expected: {
        'booking.read': true,
        'booking.create': true,
        'booking.handover.perform': true,
        'booking.documents.manage': true,
        'booking.read_sensitive': false,
      },
    },
    {
      label: 'Employee',
      systemKey: 'employee',
      expected: {
        'booking.read': true,
        'booking.create': false,
        'booking.finance.read': false,
        'booking.read_sensitive': false,
      },
    },
    {
      label: 'Driver',
      systemKey: 'driver',
      expected: {
        'booking.read': true,
        'booking.create': false,
        'booking.read_sensitive': false,
        'booking.finance.read': false,
        'booking.signature.read': false,
        'booking.handover.read': true,
        'booking.handover.perform': false,
      },
    },
    {
      label: 'Field Agent',
      systemKey: 'field_agent',
      expected: {
        'booking.read': true,
        'booking.handover.perform': true,
        'booking.documents.read': true,
        'booking.create': false,
        'booking.finance.read': false,
      },
    },
    {
      label: 'Service / Workshop',
      systemKey: 'service',
      expected: {
        'booking.read': false,
        'booking.create': false,
      },
    },
    {
      label: 'Read-only',
      systemKey: 'read_only',
      expected: {
        'booking.read': true,
        'booking.create': false,
        'booking.finance.read': true,
        'booking.audit.read': true,
        'booking.handover.perform': false,
      },
    },
  ];

  it.each(cases)('$label role template matches expected booking capabilities', ({ systemKey, expected }) => {
    const perms = normalizeMembershipPermissions(templateByKey(systemKey).permissions);
    for (const [capability, allowed] of Object.entries(expected)) {
      expect(capabilityGranted(perms, capability as BookingCapability)).toBe(allowed);
    }
  });

  it('maps every booking action to a module requirement', () => {
    for (const action of BOOKING_PERMISSION_ACTIONS) {
      const template = templateByKey('org_admin');
      const perms = normalizeMembershipPermissions(template.permissions);
      expect(evaluateOperationalPermission(perms, action)).toBe(true);
    }
  });

  it('does not grant booking.write solely from org membership without explicit flags', () => {
    const empty: MembershipPermissionsMap = {};
    expect(evaluateModulePermission(empty, 'bookings', 'write')).toBe(false);
    expect(evaluateOperationalPermission(empty, 'booking.create')).toBe(false);
  });
});
