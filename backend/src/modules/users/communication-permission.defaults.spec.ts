import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { evaluateModulePermission, normalizeMembershipPermissions } from '@shared/auth/permission.util';
import {
  deriveCommunicationPermissionsFromLegacy,
  mergeCommunicationPermissionBackfill,
} from './communication-permission.defaults';

describe('communication-permission.defaults', () => {
  it('maps ai-assistant read to communication read without manage', () => {
    const patch = deriveCommunicationPermissionsFromLegacy({
      'ai-assistant': { read: true, write: false, manage: false },
    });
    expect(patch.communication).toEqual({ read: true, write: false, manage: false });
    expect(patch['voice-assistant']).toEqual({ read: true, write: false, manage: false });
  });

  it('never grants communication.manage from ai-assistant manage alone', () => {
    const patch = deriveCommunicationPermissionsFromLegacy({
      'ai-assistant': { read: false, write: false, manage: true },
    });
    expect(patch.communication?.manage).toBe(false);
    expect(patch['voice-assistant']?.manage).toBe(true);
  });

  it('skips modules when explicit communication key exists (including explicit revoke)', () => {
    const patch = deriveCommunicationPermissionsFromLegacy({
      'ai-assistant': { read: true, write: true, manage: true },
      communication: { read: false, write: false, manage: false },
    });
    expect(patch.communication).toBeUndefined();
  });

  it('mergeCommunicationPermissionBackfill is idempotent', () => {
    const first = mergeCommunicationPermissionBackfill({
      'ai-assistant': { read: true, write: true, manage: false },
    });
    expect(first.changed).toBe(true);
    const second = mergeCommunicationPermissionBackfill(first.next);
    expect(second.changed).toBe(false);
  });

  it('org_admin template includes communication and voice-assistant manage', () => {
    const orgAdmin = DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((t) => t.systemKey === 'org_admin')!;
    const perms = normalizeMembershipPermissions(orgAdmin.permissions);
    expect(evaluateModulePermission(perms, 'communication', 'manage')).toBe(true);
    expect(evaluateModulePermission(perms, 'voice-assistant', 'manage')).toBe(true);
  });

  it('employee template does not grant communication by default (legacy bridge covers runtime)', () => {
    const employee = DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((t) => t.systemKey === 'employee')!;
    const perms = normalizeMembershipPermissions(employee.permissions);
    expect(evaluateModulePermission(perms, 'communication', 'read')).toBe(false);
    expect(evaluateModulePermission(perms, 'voice-assistant', 'read')).toBe(false);
  });

  it('driver template does not grant communication permissions', () => {
    const driver = DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((t) => t.systemKey === 'driver')!;
    const perms = normalizeMembershipPermissions(driver.permissions);
    expect(evaluateModulePermission(perms, 'communication', 'read')).toBe(false);
    expect(evaluateModulePermission(perms, 'voice-assistant', 'read')).toBe(false);
  });
});
