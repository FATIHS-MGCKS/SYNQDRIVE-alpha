import {
  evaluateModulePermission,
  type MembershipPermissionsMap,
} from './permission.util';
import {
  OPERATIONAL_PERMISSION_REQUIREMENTS,
  type OperationalPermissionAction,
} from './operational-permission.registry';

/**
 * Evaluates a granular operational permission action against normalized membership JSON.
 * Backward-compatible: existing `{ tasks, vendor-management }` module flags satisfy actions.
 */
export function evaluateOperationalPermission(
  permissions: MembershipPermissionsMap | null,
  action: OperationalPermissionAction,
): boolean {
  const requirement = OPERATIONAL_PERMISSION_REQUIREMENTS[action];
  return evaluateModulePermission(permissions, requirement.module, requirement.level);
}
