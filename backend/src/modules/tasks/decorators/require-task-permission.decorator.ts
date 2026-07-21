import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import {
  TASK_PERMISSION_REQUIREMENTS,
  type TaskPermissionAction,
} from '../task-permission.constants';

/**
 * Declarative task capability for org-scoped task routes.
 * Enforced by `PermissionsGuard` after `OrgScopingGuard`.
 *
 * Example: `@RequireTaskPermission('tasks.read')`
 */
export const RequireTaskPermission = (action: TaskPermissionAction) => {
  const requirement = TASK_PERMISSION_REQUIREMENTS[action];
  return RequirePermission(requirement.module, requirement.level);
};
