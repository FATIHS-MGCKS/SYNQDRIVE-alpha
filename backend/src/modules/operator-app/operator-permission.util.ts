import {
  evaluateModulePermission,
  type MembershipPermissionsMap,
} from '@shared/auth/permission.util';
import {
  OPERATOR_PERMISSION_REQUIREMENTS,
  type OperatorPermissionAction,
  type OperatorPermissionRequirement,
} from './operator-permission.constants';

export interface OperatorPermissionEvaluationContext {
  membershipRole?: string | null;
  fieldAgentAccess?: boolean;
  /** When true, supervisor fallback modules may satisfy the action. */
  allowSupervisorFallback?: boolean;
}

function isOrgAdminRole(role: string | null | undefined): boolean {
  return (role ?? '').trim().toUpperCase() === 'ORG_ADMIN';
}

function satisfiesRequirement(
  permissions: MembershipPermissionsMap | null,
  requirement: { module: OperatorPermissionRequirement['module']; level: OperatorPermissionRequirement['level'] },
): boolean {
  return evaluateModulePermission(permissions, requirement.module, requirement.level);
}

/**
 * Evaluates a granular operator action against materialized membership permissions.
 * ORG_ADMIN bypass matches `PermissionsGuard` / frontend `hasPermission`.
 *
 * Contextual rules (station scope, assignment, finalized records) are documented on
 * each action and must be enforced in services during endpoint migration.
 */
export function evaluateOperatorPermission(
  permissions: MembershipPermissionsMap | null,
  action: OperatorPermissionAction,
  context: OperatorPermissionEvaluationContext = {},
): boolean {
  if (isOrgAdminRole(context.membershipRole)) {
    return true;
  }

  const requirement = OPERATOR_PERMISSION_REQUIREMENTS[action];
  const contextual = requirement.contextual;

  if (contextual?.requiresFieldAgentAccess && !context.fieldAgentAccess) {
    return false;
  }

  if (satisfiesRequirement(permissions, requirement)) {
    const alsoRequires = contextual?.alsoRequires ?? [];
    if (alsoRequires.every((extra) => satisfiesRequirement(permissions, extra))) {
      return true;
    }
  }

  if (context.allowSupervisorFallback && contextual?.supervisorFallback) {
    return satisfiesRequirement(permissions, contextual.supervisorFallback);
  }

  return false;
}
