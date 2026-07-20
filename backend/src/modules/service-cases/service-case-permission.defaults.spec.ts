import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { evaluateOperationalPermission } from '@shared/auth/operational-permission.util';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import {
  SERVICE_CASE_PERMISSION_ACTIONS,
  SERVICE_CASE_PERMISSION_REQUIREMENTS,
} from './service-case-permission.constants';

describe('service case permission defaults', () => {
  const byKey = (systemKey: string) =>
    DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((t) => t.systemKey === systemKey)!;

  it('registers all required service case permission actions', () => {
    expect(SERVICE_CASE_PERMISSION_ACTIONS).toEqual([
      'service_cases.read',
      'service_cases.create',
      'service_cases.update',
      'service_cases.schedule',
      'service_cases.complete',
      'service_cases.cancel',
      'service_cases.manage_costs',
    ]);
  });

  it('maps every service case action to vendor-management module', () => {
    for (const [action, req] of Object.entries(SERVICE_CASE_PERMISSION_REQUIREMENTS)) {
      expect(action).toMatch(/^service_cases\./);
      expect(req.module).toBe('vendor-management');
      expect(['read', 'write', 'manage']).toContain(req.level);
    }
  });

  it('grants org_admin full service case capabilities', () => {
    const perms = normalizeMembershipPermissions(byKey('org_admin').permissions);
    for (const action of SERVICE_CASE_PERMISSION_ACTIONS) {
      expect(evaluateOperationalPermission(perms, action)).toBe(true);
    }
  });

  it('allows service role workshop write without manage_costs', () => {
    const perms = normalizeMembershipPermissions(byKey('service').permissions);
    expect(evaluateOperationalPermission(perms, 'service_cases.read')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'service_cases.create')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'service_cases.schedule')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'service_cases.manage_costs')).toBe(false);
  });

  it('denies employee service case access (no vendor-management module)', () => {
    const perms = normalizeMembershipPermissions(byKey('employee').permissions);
    expect(evaluateOperationalPermission(perms, 'service_cases.read')).toBe(false);
    expect(evaluateOperationalPermission(perms, 'service_cases.create')).toBe(false);
  });

  it('denies station_manager service case access without vendor-management module', () => {
    const perms = normalizeMembershipPermissions(byKey('station_manager').permissions);
    expect(evaluateOperationalPermission(perms, 'service_cases.read')).toBe(false);
    expect(evaluateOperationalPermission(perms, 'service_cases.create')).toBe(false);
  });

  it('allows sub_admin service case read via inherited vendor-management access', () => {
    const perms = normalizeMembershipPermissions(byKey('sub_admin').permissions);
    expect(evaluateOperationalPermission(perms, 'service_cases.read')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'service_cases.create')).toBe(true);
  });
});
