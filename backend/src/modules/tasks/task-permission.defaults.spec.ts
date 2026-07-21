import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { evaluateOperationalPermission } from '@shared/auth/operational-permission.util';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { TASK_PERMISSION_ACTIONS, TASK_PERMISSION_REQUIREMENTS } from './task-permission.constants';

describe('task permission defaults', () => {
  const byKey = (systemKey: string) =>
    DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((t) => t.systemKey === systemKey)!;

  it('registers all required task permission actions', () => {
    expect(TASK_PERMISSION_ACTIONS).toEqual([
      'tasks.read',
      'tasks.create',
      'tasks.update',
      'tasks.assign',
      'tasks.complete',
      'tasks.cancel',
      'tasks.manage_costs',
    ]);
  });

  it('maps every task action to the tasks module', () => {
    for (const [action, req] of Object.entries(TASK_PERMISSION_REQUIREMENTS)) {
      expect(action).toMatch(/^tasks\./);
      expect(req.module).toBe('tasks');
      expect(['read', 'write', 'manage']).toContain(req.level);
    }
  });

  it('grants org_admin full task capabilities via tasks.manage', () => {
    const perms = normalizeMembershipPermissions(byKey('org_admin').permissions);
    for (const action of TASK_PERMISSION_ACTIONS) {
      expect(evaluateOperationalPermission(perms, action)).toBe(true);
    }
  });

  it('allows station_manager task writes without manage_costs', () => {
    const perms = normalizeMembershipPermissions(byKey('station_manager').permissions);
    expect(evaluateOperationalPermission(perms, 'tasks.read')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'tasks.create')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'tasks.complete')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'tasks.manage_costs')).toBe(false);
  });

  it('allows employee read-only task access', () => {
    const perms = normalizeMembershipPermissions(byKey('employee').permissions);
    expect(evaluateOperationalPermission(perms, 'tasks.read')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'tasks.create')).toBe(false);
    expect(evaluateOperationalPermission(perms, 'tasks.update')).toBe(false);
  });

  it('allows service role read-only tasks (workshop focus on vendor-management)', () => {
    const perms = normalizeMembershipPermissions(byKey('service').permissions);
    expect(evaluateOperationalPermission(perms, 'tasks.read')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'tasks.create')).toBe(false);
  });
});
