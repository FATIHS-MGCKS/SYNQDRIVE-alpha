import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { PERMISSION_MODULE_KEYS } from '@shared/auth/permission.constants';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import {
  OPERATOR_PERMISSION_ACTIONS,
  OPERATOR_PERMISSION_REQUIREMENTS,
} from './operator-permission.constants';
import { evaluateOperatorPermission } from './operator-permission.util';

describe('operator permission matrix', () => {
  const byKey = (systemKey: string) =>
    DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((t) => t.systemKey === systemKey)!;

  it('registers all required operator permission actions', () => {
    expect(OPERATOR_PERMISSION_ACTIONS).toHaveLength(28);
    expect(new Set(OPERATOR_PERMISSION_ACTIONS).size).toBe(28);
  });

  it('maps every operator action to a known permission module', () => {
    const moduleSet = new Set<string>(PERMISSION_MODULE_KEYS);
    for (const action of OPERATOR_PERMISSION_ACTIONS) {
      const requirement = OPERATOR_PERMISSION_REQUIREMENTS[action];
      expect(requirement).toBeDefined();
      expect(moduleSet.has(requirement.module)).toBe(true);
      expect(['read', 'write', 'manage']).toContain(requirement.level);
      expect(requirement.code).toMatch(/^OPERATOR_/);
    }
  });

  it('uses operator.* namespace exclusively', () => {
    for (const action of OPERATOR_PERMISSION_ACTIONS) {
      expect(action).toMatch(/^operator\./);
    }
  });

  it('does not introduce parallel storage modules beyond operator-app', () => {
    const operatorModules = new Set(
      Object.values(OPERATOR_PERMISSION_REQUIREMENTS).map((r) => r.module),
    );
    expect(operatorModules.has('operator-app')).toBe(true);
    expect([...operatorModules].filter((m) => m.startsWith('operator-'))).toEqual(['operator-app']);
  });

  describe('field_agent role', () => {
    const template = byKey('field_agent');
    const perms = normalizeMembershipPermissions(template.permissions)!;

    it('has operator-app write for shell mutations', () => {
      expect(perms['operator-app']?.write).toBe(true);
    });

    it('can access operator app and complete handovers', () => {
      expect(
        evaluateOperatorPermission(perms, 'operator.app.access', {
          membershipRole: template.membershipRole,
          fieldAgentAccess: template.fieldAgentAccessDefault,
        }),
      ).toBe(true);
      expect(
        evaluateOperatorPermission(perms, 'operator.handover.complete', {
          membershipRole: template.membershipRole,
          fieldAgentAccess: template.fieldAgentAccessDefault,
        }),
      ).toBe(true);
      expect(
        evaluateOperatorPermission(perms, 'operator.handover.override', {
          membershipRole: template.membershipRole,
          fieldAgentAccess: template.fieldAgentAccessDefault,
        }),
      ).toBe(true);
    });

    it('cannot cancel bookings without bookings.manage', () => {
      expect(
        evaluateOperatorPermission(perms, 'operator.booking.cancel', {
          membershipRole: template.membershipRole,
        }),
      ).toBe(false);
    });
  });

  describe('employee role (WORKER baseline)', () => {
    const template = byKey('employee');
    const perms = normalizeMembershipPermissions(template.permissions);

    it('can open operator app read-only shell', () => {
      expect(
        evaluateOperatorPermission(perms, 'operator.app.access', {
          membershipRole: template.membershipRole,
        }),
      ).toBe(true);
    });

    it('cannot complete handovers or create damages without write grants', () => {
      expect(
        evaluateOperatorPermission(perms, 'operator.handover.complete', {
          membershipRole: template.membershipRole,
          fieldAgentAccess: false,
        }),
      ).toBe(false);
      expect(evaluateOperatorPermission(perms, 'operator.damage.create')).toBe(false);
      expect(evaluateOperatorPermission(perms, 'operator.task.complete')).toBe(false);
    });
  });

  describe('driver role', () => {
    const template = byKey('driver');
    const perms = normalizeMembershipPermissions(template.permissions);

    it('is denied operator app access without operator-app module', () => {
      expect(evaluateOperatorPermission(perms, 'operator.app.access')).toBe(false);
    });
  });

  describe('station_manager role', () => {
    const template = byKey('station_manager');
    const perms = normalizeMembershipPermissions(template.permissions)!;

    it('has supervisor operator-app manage and can verify damages', () => {
      expect(perms['operator-app']?.manage).toBe(true);
      expect(perms['fleet-condition']?.manage).toBe(true);
      expect(
        evaluateOperatorPermission(perms, 'operator.damage.verify', {
          membershipRole: template.membershipRole,
        }),
      ).toBe(true);
    });
  });

  describe('service role', () => {
    const template = byKey('service');
    const perms = normalizeMembershipPermissions(template.permissions);

    it('can read operator shell and inspect vehicles but not handover', () => {
      expect(evaluateOperatorPermission(perms, 'operator.app.access')).toBe(true);
      expect(evaluateOperatorPermission(perms, 'operator.vehicle.inspect')).toBe(true);
      expect(evaluateOperatorPermission(perms, 'operator.handover.complete')).toBe(false);
    });
  });

  it('requires fieldAgentAccess for handover.complete when flagged', () => {
    const perms = normalizeMembershipPermissions(byKey('field_agent').permissions);
    expect(
      evaluateOperatorPermission(perms, 'operator.handover.complete', {
        fieldAgentAccess: false,
      }),
    ).toBe(false);
  });
});
