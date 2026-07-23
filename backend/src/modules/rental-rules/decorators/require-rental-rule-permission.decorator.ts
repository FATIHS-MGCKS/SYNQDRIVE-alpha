import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import {
  RENTAL_RULE_PERMISSION_REQUIREMENTS,
  type RentalRulePermissionAction,
} from '../rental-rules-permission.constants';

/**
 * Declarative rental-rules capability for org-scoped routes.
 * Enforced by `PermissionsGuard` after `OrgScopingGuard`.
 */
export const RequireRentalRulePermission = (action: RentalRulePermissionAction) => {
  const requirement = RENTAL_RULE_PERMISSION_REQUIREMENTS[action];
  return RequirePermission(requirement.module, requirement.level);
};
