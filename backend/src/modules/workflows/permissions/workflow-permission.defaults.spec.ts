import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { evaluateModulePermission, normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { evaluateWorkflowPermission } from './workflow-permission.util';
import {
  WORKFLOW_PERMISSION_ACTIONS,
  WORKFLOW_PERMISSION_REQUIREMENTS,
} from './workflow-permission.constants';

describe('workflow role defaults', () => {
  const byKey = (systemKey: string) =>
    DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((t) => t.systemKey === systemKey)!;

  it('grants org_admin full workflow capabilities across sub-modules', () => {
    const perms = normalizeMembershipPermissions(byKey('org_admin').permissions);
    for (const action of WORKFLOW_PERMISSION_ACTIONS) {
      expect(evaluateWorkflowPermission(perms, action)).toBe(true);
    }
  });

  it('denies sub_admin publish, external test, secrets, policy, templates, replay, approval write', () => {
    const perms = normalizeMembershipPermissions(byKey('sub_admin').permissions);
    expect(evaluateWorkflowPermission(perms, 'workflow.read')).toBe(true);
    expect(evaluateWorkflowPermission(perms, 'workflow.create')).toBe(true);
    expect(evaluateWorkflowPermission(perms, 'workflow.edit_draft')).toBe(true);
    expect(evaluateWorkflowPermission(perms, 'workflow.test_dry_run')).toBe(true);
    expect(evaluateWorkflowPermission(perms, 'workflow.approval.read')).toBe(true);
    expect(evaluateWorkflowPermission(perms, 'workflow.run.read')).toBe(true);
    expect(evaluateWorkflowPermission(perms, 'workflow.audit.read')).toBe(true);
    expect(evaluateWorkflowPermission(perms, 'workflow.dead_letter.read')).toBe(true);

    expect(evaluateWorkflowPermission(perms, 'workflow.publish')).toBe(false);
    expect(evaluateWorkflowPermission(perms, 'workflow.enable')).toBe(false);
    expect(evaluateWorkflowPermission(perms, 'workflow.disable')).toBe(false);
    expect(evaluateWorkflowPermission(perms, 'workflow.archive')).toBe(false);
    expect(evaluateWorkflowPermission(perms, 'workflow.test_external')).toBe(false);
    expect(evaluateWorkflowPermission(perms, 'workflow.approve')).toBe(false);
    expect(evaluateWorkflowPermission(perms, 'workflow.reject')).toBe(false);
    expect(evaluateWorkflowPermission(perms, 'workflow.retry')).toBe(false);
    expect(evaluateWorkflowPermission(perms, 'workflow.cancel')).toBe(false);
    expect(evaluateWorkflowPermission(perms, 'workflow.dead_letter.replay')).toBe(false);
    expect(evaluateWorkflowPermission(perms, 'workflow.secrets.manage')).toBe(false);
    expect(evaluateWorkflowPermission(perms, 'workflow.policy.manage')).toBe(false);
    expect(evaluateWorkflowPermission(perms, 'workflow.template.manage')).toBe(false);
  });

  it('denies worker all workflow permissions by default', () => {
    const perms = normalizeMembershipPermissions(byKey('employee').permissions);
    for (const action of WORKFLOW_PERMISSION_ACTIONS) {
      expect(evaluateWorkflowPermission(perms, action)).toBe(false);
    }
  });

  it('denies driver workflow access', () => {
    const perms = normalizeMembershipPermissions(byKey('driver').permissions)!;
    expect(evaluateWorkflowPermission(perms, 'workflow.read')).toBe(false);
    expect(evaluateModulePermission(perms, 'workflow-automation', 'read')).toBe(false);
  });

  it('maps every workflow permission action to a known module requirement', () => {
    for (const [action, req] of Object.entries(WORKFLOW_PERMISSION_REQUIREMENTS)) {
      expect(WORKFLOW_PERMISSION_ACTIONS).toContain(action);
      expect(req.module).toMatch(/^workflow-automation/);
      expect(['read', 'write', 'manage']).toContain(req.level);
    }
  });

  it('requires manage for external test but only read for dry run', () => {
    expect(WORKFLOW_PERMISSION_REQUIREMENTS['workflow.test_dry_run'].level).toBe('read');
    expect(WORKFLOW_PERMISSION_REQUIREMENTS['workflow.test_external'].level).toBe('manage');
    expect(
      WORKFLOW_PERMISSION_REQUIREMENTS['workflow.test_external'].module,
    ).toBe('workflow-automation-test-external');
  });

  it('separates audit read from workflow edit', () => {
    const perms = normalizeMembershipPermissions(byKey('sub_admin').permissions);
    expect(evaluateModulePermission(perms, 'workflow-automation', 'write')).toBe(true);
    expect(evaluateModulePermission(perms, 'workflow-automation-audit', 'read')).toBe(true);
    expect(evaluateModulePermission(perms, 'workflow-automation-audit', 'write')).toBe(false);
  });
});
