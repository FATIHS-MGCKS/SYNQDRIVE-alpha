import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { BOOKING_ELIGIBILITY_PERMISSION_ACTIONS } from '@modules/bookings/booking-eligibility-permission.constants';
import { RENTAL_RULE_PERMISSION_ACTIONS } from './rental-rules-permission.constants';
import {
  evaluateBookingEligibilityPermission,
  evaluateRentalRulePermission,
} from './rental-rules-permission.util';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';

describe('rental-rules-permission.defaults', () => {
  const byKey = (systemKey: string) =>
    DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((t) => t.systemKey === systemKey)!;

  it('registers all required rental rule permission actions', () => {
    expect(RENTAL_RULE_PERMISSION_ACTIONS).toEqual([
      'rental_rules.read',
      'rental_rules.write',
      'rental_rules.publish',
      'rental_rules.assign_vehicles',
      'rental_rules.manage_overrides',
    ]);
  });

  it('registers all required booking eligibility permission actions', () => {
    expect(BOOKING_ELIGIBILITY_PERMISSION_ACTIONS).toEqual([
      'booking_eligibility.review',
      'booking_eligibility.override',
    ]);
  });

  it('grants org_admin full rental rules and eligibility capabilities', () => {
    const perms = normalizeMembershipPermissions(byKey('org_admin').permissions);
    for (const action of RENTAL_RULE_PERMISSION_ACTIONS) {
      expect(evaluateRentalRulePermission(perms, action)).toBe(true);
    }
    for (const action of BOOKING_ELIGIBILITY_PERMISSION_ACTIONS) {
      expect(evaluateBookingEligibilityPermission(perms, action)).toBe(true);
    }
  });

  it('grants sub_admin read-only rental rules with eligibility review only', () => {
    const perms = normalizeMembershipPermissions(byKey('sub_admin').permissions);
    expect(evaluateRentalRulePermission(perms, 'rental_rules.read')).toBe(true);
    expect(evaluateRentalRulePermission(perms, 'rental_rules.write')).toBe(false);
    expect(evaluateRentalRulePermission(perms, 'rental_rules.publish')).toBe(false);
    expect(evaluateBookingEligibilityPermission(perms, 'booking_eligibility.review')).toBe(true);
    expect(evaluateBookingEligibilityPermission(perms, 'booking_eligibility.override')).toBe(false);
  });

  it('denies worker and driver rental rule mutations', () => {
    for (const systemKey of ['employee', 'driver'] as const) {
      const perms = normalizeMembershipPermissions(byKey(systemKey).permissions);
      expect(evaluateRentalRulePermission(perms, 'rental_rules.write')).toBe(false);
      expect(evaluateRentalRulePermission(perms, 'rental_rules.publish')).toBe(false);
      expect(evaluateRentalRulePermission(perms, 'rental_rules.assign_vehicles')).toBe(false);
      expect(evaluateRentalRulePermission(perms, 'rental_rules.manage_overrides')).toBe(false);
    }
  });

  it('allows employee eligibility review but not override', () => {
    const perms = normalizeMembershipPermissions(byKey('employee').permissions);
    expect(evaluateRentalRulePermission(perms, 'rental_rules.read')).toBe(true);
    expect(evaluateBookingEligibilityPermission(perms, 'booking_eligibility.review')).toBe(true);
    expect(evaluateBookingEligibilityPermission(perms, 'booking_eligibility.override')).toBe(false);
  });

  it('denies driver all rental rules and eligibility permissions', () => {
    const perms = normalizeMembershipPermissions(byKey('driver').permissions);
    expect(evaluateRentalRulePermission(perms, 'rental_rules.read')).toBe(false);
    expect(evaluateBookingEligibilityPermission(perms, 'booking_eligibility.review')).toBe(false);
    expect(evaluateBookingEligibilityPermission(perms, 'booking_eligibility.override')).toBe(false);
  });

  it('separates publish from write for disposition', () => {
    const perms = normalizeMembershipPermissions(byKey('disposition').permissions);
    expect(evaluateRentalRulePermission(perms, 'rental_rules.read')).toBe(true);
    expect(evaluateRentalRulePermission(perms, 'rental_rules.write')).toBe(false);
    expect(evaluateRentalRulePermission(perms, 'rental_rules.publish')).toBe(false);
    expect(evaluateBookingEligibilityPermission(perms, 'booking_eligibility.override')).toBe(true);
  });

  it('allows station_manager fleet assignment and overrides without publish', () => {
    const perms = normalizeMembershipPermissions(byKey('station_manager').permissions);
    expect(evaluateRentalRulePermission(perms, 'rental_rules.assign_vehicles')).toBe(true);
    expect(evaluateRentalRulePermission(perms, 'rental_rules.manage_overrides')).toBe(true);
    expect(evaluateRentalRulePermission(perms, 'rental_rules.publish')).toBe(false);
    expect(evaluateRentalRulePermission(perms, 'rental_rules.write')).toBe(false);
    expect(evaluateBookingEligibilityPermission(perms, 'booking_eligibility.override')).toBe(true);
  });
});
