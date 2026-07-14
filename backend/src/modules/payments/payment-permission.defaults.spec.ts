import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { evaluateModulePermission, normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { PAYMENT_PERMISSION_REQUIREMENTS } from './payment-permission.constants';

describe('payment role defaults', () => {
  const byKey = (systemKey: string) =>
    DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((t) => t.systemKey === systemKey)!;

  it('grants org_admin full payment capabilities separate from billing', () => {
    const perms = normalizeMembershipPermissions(byKey('org_admin').permissions);
    expect(evaluateModulePermission(perms, 'payments', 'write')).toBe(true);
    expect(evaluateModulePermission(perms, 'payments-refund', 'write')).toBe(true);
    expect(evaluateModulePermission(perms, 'payments-connect', 'manage')).toBe(true);
    expect(evaluateModulePermission(perms, 'payments-settings', 'manage')).toBe(true);
    expect(evaluateModulePermission(perms, 'billing', 'write')).toBe(true);
  });

  it('denies sub_admin all payment modules', () => {
    const perms = normalizeMembershipPermissions(byKey('sub_admin').permissions)!;
    expect(perms.payments).toBeUndefined();
    expect(perms['payments-refund']).toBeUndefined();
    expect(evaluateModulePermission(perms, 'billing', 'read')).toBe(true);
  });

  it('allows disposition manager payment requests without refunds or connect', () => {
    const perms = normalizeMembershipPermissions(byKey('disposition').permissions);
    expect(evaluateModulePermission(perms, 'payments', 'write')).toBe(true);
    expect(evaluateModulePermission(perms, 'payments-refund', 'write')).toBe(false);
    expect(evaluateModulePermission(perms, 'payments-connect', 'manage')).toBe(false);
  });

  it('allows accounting refunds via dedicated payments-refund module', () => {
    const perms = normalizeMembershipPermissions(byKey('accounting').permissions);
    expect(evaluateModulePermission(perms, 'payments-refund', 'write')).toBe(true);
    expect(evaluateModulePermission(perms, 'payments-connect', 'read')).toBe(true);
    expect(evaluateModulePermission(perms, 'payments-connect', 'manage')).toBe(false);
  });

  it('allows worker read-only payment status', () => {
    const perms = normalizeMembershipPermissions(byKey('employee').permissions);
    expect(evaluateModulePermission(perms, 'payments', 'read')).toBe(true);
    expect(evaluateModulePermission(perms, 'payments', 'write')).toBe(false);
    expect(evaluateModulePermission(perms, 'payments-refund', 'write')).toBe(false);
  });

  it('denies driver all payment permissions', () => {
    const perms = normalizeMembershipPermissions(byKey('driver').permissions)!;
    expect(perms.payments).toBeUndefined();
    expect(evaluateModulePermission(perms, 'payments', 'read')).toBe(false);
  });

  it('maps every payment permission action to a known module requirement', () => {
    for (const [action, req] of Object.entries(PAYMENT_PERMISSION_REQUIREMENTS)) {
      expect(action).toMatch(/^payments\./);
      expect(req.module).toMatch(/^payments/);
      expect(['read', 'write', 'manage']).toContain(req.level);
    }
  });
});
