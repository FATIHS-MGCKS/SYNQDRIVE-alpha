import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import type { PermissionModuleKey } from '@shared/auth/permission.constants';

/**
 * Granular workflow permission actions.
 * Mapped to org-scoped membership JSON modules — backend is source of truth.
 */
export const WORKFLOW_PERMISSION_ACTIONS = [
  'workflow.read',
  'workflow.create',
  'workflow.edit_draft',
  'workflow.publish',
  'workflow.enable',
  'workflow.disable',
  'workflow.archive',
  'workflow.test_dry_run',
  'workflow.test_external',
  'workflow.approval.read',
  'workflow.approve',
  'workflow.reject',
  'workflow.run.read',
  'workflow.audit.read',
  'workflow.retry',
  'workflow.cancel',
  'workflow.dead_letter.read',
  'workflow.dead_letter.replay',
  'workflow.secrets.manage',
  'workflow.policy.manage',
  'workflow.template.manage',
] as const;

export type WorkflowPermissionAction = (typeof WORKFLOW_PERMISSION_ACTIONS)[number];

export interface WorkflowPermissionRequirement {
  module: PermissionModuleKey;
  level: PermissionLevel;
}

export const WORKFLOW_PERMISSION_REQUIREMENTS: Readonly<
  Record<WorkflowPermissionAction, WorkflowPermissionRequirement>
> = {
  'workflow.read': { module: 'workflow-automation', level: 'read' },
  'workflow.create': { module: 'workflow-automation', level: 'write' },
  'workflow.edit_draft': { module: 'workflow-automation', level: 'write' },
  'workflow.publish': { module: 'workflow-automation-publish', level: 'manage' },
  'workflow.enable': { module: 'workflow-automation-publish', level: 'write' },
  'workflow.disable': { module: 'workflow-automation-publish', level: 'write' },
  'workflow.archive': { module: 'workflow-automation-publish', level: 'manage' },
  'workflow.test_dry_run': { module: 'workflow-automation-test', level: 'read' },
  'workflow.test_external': { module: 'workflow-automation-test-external', level: 'manage' },
  'workflow.approval.read': { module: 'workflow-automation-approval', level: 'read' },
  'workflow.approve': { module: 'workflow-automation-approval', level: 'write' },
  'workflow.reject': { module: 'workflow-automation-approval', level: 'write' },
  'workflow.run.read': { module: 'workflow-automation-runs', level: 'read' },
  'workflow.audit.read': { module: 'workflow-automation-audit', level: 'read' },
  'workflow.retry': { module: 'workflow-automation-runs', level: 'manage' },
  'workflow.cancel': { module: 'workflow-automation-runs', level: 'write' },
  'workflow.dead_letter.read': { module: 'workflow-automation-dead-letter', level: 'read' },
  'workflow.dead_letter.replay': { module: 'workflow-automation-dead-letter', level: 'manage' },
  'workflow.secrets.manage': { module: 'workflow-automation-secrets', level: 'manage' },
  'workflow.policy.manage': { module: 'workflow-automation-policy', level: 'manage' },
  'workflow.template.manage': { module: 'workflow-automation-templates', level: 'manage' },
};

export function isWorkflowPermissionAction(value: string): value is WorkflowPermissionAction {
  return (WORKFLOW_PERMISSION_ACTIONS as readonly string[]).includes(value);
}
