import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import {
  OPERATOR_PERMISSION_REQUIREMENTS,
  type OperatorPermissionAction,
} from '../operator-permission.constants';

/**
 * Declarative operator capability for org-scoped routes.
 * Enforced by `PermissionsGuard` after `OrgScopingGuard`.
 *
 * Contextual rules (station scope, assignment, finalized resources) remain in services.
 *
 * Example: `@RequireOperatorPermission('operator.handover.complete')`
 */
export const RequireOperatorPermission = (action: OperatorPermissionAction) => {
  const requirement = OPERATOR_PERMISSION_REQUIREMENTS[action];
  return RequirePermission(requirement.module, requirement.level);
};
