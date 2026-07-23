import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import {
  LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS,
  type LegalDocumentPermissionAction,
} from '../legal-document-permission.constants';

/**
 * Declarative legal-document capability for org-scoped routes.
 * Enforced by `PermissionsGuard` after `OrgScopingGuard`.
 *
 * Example: `@RequireLegalDocumentPermission('legal_documents.upload')`
 */
export const RequireLegalDocumentPermission = (action: LegalDocumentPermissionAction) => {
  const requirement = LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS[action];
  return RequirePermission(requirement.module, requirement.level);
};
