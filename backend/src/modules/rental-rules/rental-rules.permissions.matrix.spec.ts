import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { BOOKING_ELIGIBILITY_PERMISSION_ACTIONS } from '@modules/bookings/booking-eligibility-permission.constants';
import { RENTAL_RULE_PERMISSION_ACTIONS, RENTAL_RULE_PERMISSION_REQUIREMENTS } from '@modules/rental-rules/rental-rules-permission.constants';
import {
  evaluateBookingEligibilityPermission,
  evaluateRentalRulePermission,
} from '@modules/rental-rules/rental-rules-permission.util';
import { PERMISSION_MODULE_KEYS } from '@shared/auth/permission.constants';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';

type RentalRulesCapability =
  | (typeof RENTAL_RULE_PERMISSION_ACTIONS)[number]
  | (typeof BOOKING_ELIGIBILITY_PERMISSION_ACTIONS)[number];

function capabilityGranted(
  permissions: ReturnType<typeof normalizeMembershipPermissions>,
  capability: RentalRulesCapability,
): boolean {
  if ((RENTAL_RULE_PERMISSION_ACTIONS as readonly string[]).includes(capability)) {
    return evaluateRentalRulePermission(permissions, capability as (typeof RENTAL_RULE_PERMISSION_ACTIONS)[number]);
  }
  return evaluateBookingEligibilityPermission(
    permissions,
    capability as (typeof BOOKING_ELIGIBILITY_PERMISSION_ACTIONS)[number],
  );
}

const templateByKey = (systemKey: string) =>
  DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((template) => template.systemKey === systemKey)!;

const ALL_CAPABILITIES: RentalRulesCapability[] = [
  ...RENTAL_RULE_PERMISSION_ACTIONS,
  ...BOOKING_ELIGIBILITY_PERMISSION_ACTIONS,
];

describe('Rental rules permissions matrix — tenant role templates', () => {
  const cases: Array<{
    label: string;
    systemKey: string;
    expected: Record<RentalRulesCapability, boolean>;
  }> = [
    {
      label: 'Org Admin',
      systemKey: 'org_admin',
      expected: {
        'rental_rules.read': true,
        'rental_rules.write': true,
        'rental_rules.publish': true,
        'rental_rules.assign_vehicles': true,
        'rental_rules.manage_overrides': true,
        'booking_eligibility.review': true,
        'booking_eligibility.override': true,
      },
    },
    {
      label: 'Sub Admin',
      systemKey: 'sub_admin',
      expected: {
        'rental_rules.read': true,
        'rental_rules.write': false,
        'rental_rules.publish': false,
        'rental_rules.assign_vehicles': false,
        'rental_rules.manage_overrides': false,
        'booking_eligibility.review': true,
        'booking_eligibility.override': false,
      },
    },
    {
      label: 'Disposition',
      systemKey: 'disposition',
      expected: {
        'rental_rules.read': true,
        'rental_rules.write': false,
        'rental_rules.publish': false,
        'rental_rules.assign_vehicles': false,
        'rental_rules.manage_overrides': false,
        'booking_eligibility.review': true,
        'booking_eligibility.override': true,
      },
    },
    {
      label: 'Accounting',
      systemKey: 'accounting',
      expected: {
        'rental_rules.read': false,
        'rental_rules.write': false,
        'rental_rules.publish': false,
        'rental_rules.assign_vehicles': false,
        'rental_rules.manage_overrides': false,
        'booking_eligibility.review': true,
        'booking_eligibility.override': false,
      },
    },
    {
      label: 'Station Manager',
      systemKey: 'station_manager',
      expected: {
        'rental_rules.read': true,
        'rental_rules.write': false,
        'rental_rules.publish': false,
        'rental_rules.assign_vehicles': true,
        'rental_rules.manage_overrides': true,
        'booking_eligibility.review': true,
        'booking_eligibility.override': true,
      },
    },
    {
      label: 'Employee / Worker',
      systemKey: 'employee',
      expected: {
        'rental_rules.read': true,
        'rental_rules.write': false,
        'rental_rules.publish': false,
        'rental_rules.assign_vehicles': false,
        'rental_rules.manage_overrides': false,
        'booking_eligibility.review': true,
        'booking_eligibility.override': false,
      },
    },
    {
      label: 'Driver',
      systemKey: 'driver',
      expected: {
        'rental_rules.read': false,
        'rental_rules.write': false,
        'rental_rules.publish': false,
        'rental_rules.assign_vehicles': false,
        'rental_rules.manage_overrides': false,
        'booking_eligibility.review': false,
        'booking_eligibility.override': false,
      },
    },
    {
      label: 'Field Agent',
      systemKey: 'field_agent',
      expected: {
        'rental_rules.read': true,
        'rental_rules.write': false,
        'rental_rules.publish': false,
        'rental_rules.assign_vehicles': false,
        'rental_rules.manage_overrides': false,
        'booking_eligibility.review': true,
        'booking_eligibility.override': true,
      },
    },
    {
      label: 'Service / Workshop',
      systemKey: 'service',
      expected: {
        'rental_rules.read': true,
        'rental_rules.write': false,
        'rental_rules.publish': false,
        'rental_rules.assign_vehicles': false,
        'rental_rules.manage_overrides': false,
        'booking_eligibility.review': false,
        'booking_eligibility.override': false,
      },
    },
    {
      label: 'Read-only',
      systemKey: 'read_only',
      expected: {
        'rental_rules.read': true,
        'rental_rules.write': false,
        'rental_rules.publish': false,
        'rental_rules.assign_vehicles': false,
        'rental_rules.manage_overrides': false,
        'booking_eligibility.review': true,
        'booking_eligibility.override': false,
      },
    },
  ];

  it.each(cases)('$label capability matrix matches template defaults', ({ systemKey, expected }) => {
    const permissions = normalizeMembershipPermissions(templateByKey(systemKey).permissions);
    for (const capability of ALL_CAPABILITIES) {
      expect(capabilityGranted(permissions, capability)).toBe(expected[capability]);
    }
  });

  it('maps every rental rule action to a known module requirement', () => {
    const moduleSet = new Set<string>(PERMISSION_MODULE_KEYS);
    for (const action of RENTAL_RULE_PERMISSION_ACTIONS) {
      const requirement = RENTAL_RULE_PERMISSION_REQUIREMENTS[action];
      expect(requirement).toBeDefined();
      expect(moduleSet.has(requirement.module)).toBe(true);
      expect(['read', 'write', 'manage']).toContain(requirement.level);
    }
  });

  it('does not grant publish when only rental-rules.write is set explicitly', () => {
    const permissions = normalizeMembershipPermissions({
      'rental-rules': { read: true, write: true, manage: false },
      'rental-rules-publish': { read: false, write: false, manage: false },
    });
    expect(evaluateRentalRulePermission(permissions, 'rental_rules.write')).toBe(true);
    expect(evaluateRentalRulePermission(permissions, 'rental_rules.publish')).toBe(false);
  });

  it('does not grant override when only booking-eligibility.read is set', () => {
    const permissions = normalizeMembershipPermissions({
      'booking-eligibility': { read: true, write: false, manage: false },
      'booking-eligibility-override': { read: false, write: false, manage: false },
    });
    expect(evaluateBookingEligibilityPermission(permissions, 'booking_eligibility.review')).toBe(true);
    expect(evaluateBookingEligibilityPermission(permissions, 'booking_eligibility.override')).toBe(false);
  });
});

describe('Rental rules permissions matrix — platform roles', () => {
  it('documents that Customer is not an organization membership role', () => {
    const membershipRoles = new Set(
      DEFAULT_ORGANIZATION_ROLE_TEMPLATES.map((t) => t.membershipRole),
    );
    expect(membershipRoles.has('ORG_ADMIN')).toBe(true);
    expect(membershipRoles.has('SUB_ADMIN')).toBe(true);
    expect(membershipRoles.has('WORKER')).toBe(true);
    expect(membershipRoles.has('DRIVER')).toBe(true);
    expect([...membershipRoles]).not.toContain('CUSTOMER');
  });
});
