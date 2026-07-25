import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import {
  WORKFLOW_PERMISSION_REQUIREMENTS,
  type WorkflowPermissionAction,
} from './workflow-permission.constants';

/**
 * Declarative workflow capability for org-scoped routes.
 * Enforced by `PermissionsGuard` after `OrgScopingGuard`.
 */
export const RequireWorkflowPermission = (action: WorkflowPermissionAction) => {
  const requirement = WORKFLOW_PERMISSION_REQUIREMENTS[action];
  return RequirePermission(requirement.module, requirement.level);
};
