import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import {
  SERVICE_CASE_PERMISSION_REQUIREMENTS,
  type ServiceCasePermissionAction,
} from '../service-case-permission.constants';

/**
 * Declarative service-case capability for org-scoped routes.
 * Enforced by `PermissionsGuard` after `OrgScopingGuard`.
 *
 * Example: `@RequireServiceCasePermission('service_cases.read')`
 */
export const RequireServiceCasePermission = (action: ServiceCasePermissionAction) => {
  const requirement = SERVICE_CASE_PERMISSION_REQUIREMENTS[action];
  return RequirePermission(requirement.module, requirement.level);
};
