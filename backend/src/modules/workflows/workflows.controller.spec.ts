import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { WORKFLOW_PERMISSION_REQUIREMENTS } from './permissions/workflow-permission.constants';
import { WorkflowsController } from './workflows.controller';

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

describe('WorkflowsController security', () => {
  it('uses org-scoped workflows route', () => {
    const path = Reflect.getMetadata('path', WorkflowsController);
    expect(path).toBe('organizations/:orgId/workflows');
  });

  it('applies OrgScopingGuard and PermissionsGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, WorkflowsController);
    expect(guards).toEqual(expect.arrayContaining([OrgScopingGuard, PermissionsGuard]));
  });

  it('maps read routes to workflow.read or workflow.run.read', () => {
    expect(permissionOf(WorkflowsController.prototype, 'list')).toEqual(
      WORKFLOW_PERMISSION_REQUIREMENTS['workflow.read'],
    );
    expect(permissionOf(WorkflowsController.prototype, 'getRun')).toEqual(
      WORKFLOW_PERMISSION_REQUIREMENTS['workflow.run.read'],
    );
    expect(permissionOf(WorkflowsController.prototype, 'listRuns')).toEqual(
      WORKFLOW_PERMISSION_REQUIREMENTS['workflow.run.read'],
    );
  });

  it('maps dry-run risk preview separately from external workflow test', () => {
    expect(permissionOf(WorkflowsController.prototype, 'previewRisk')).toEqual(
      WORKFLOW_PERMISSION_REQUIREMENTS['workflow.test_dry_run'],
    );
    expect(permissionOf(WorkflowsController.prototype, 'test')).toEqual(
      WORKFLOW_PERMISSION_REQUIREMENTS['workflow.test_external'],
    );
  });

  it('maps approval routes to dedicated approval permissions', () => {
    expect(permissionOf(WorkflowsController.prototype, 'approveAction')).toEqual(
      WORKFLOW_PERMISSION_REQUIREMENTS['workflow.approve'],
    );
    expect(permissionOf(WorkflowsController.prototype, 'rejectAction')).toEqual(
      WORKFLOW_PERMISSION_REQUIREMENTS['workflow.reject'],
    );
  });

  it('maps archive delete to workflow.archive', () => {
    expect(permissionOf(WorkflowsController.prototype, 'remove')).toEqual(
      WORKFLOW_PERMISSION_REQUIREMENTS['workflow.archive'],
    );
  });
});
