import {
  evaluateModulePermission,
  type MembershipPermissionsMap,
} from '@shared/auth/permission.util';
import {
  WORKFLOW_PERMISSION_REQUIREMENTS,
  type WorkflowPermissionAction,
} from './workflow-permission.constants';

export function evaluateWorkflowPermission(
  permissions: MembershipPermissionsMap | null,
  action: WorkflowPermissionAction,
): boolean {
  const requirement = WORKFLOW_PERMISSION_REQUIREMENTS[action];
  return evaluateModulePermission(permissions, requirement.module, requirement.level);
}
