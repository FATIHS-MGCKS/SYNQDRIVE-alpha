import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import type { PermissionModuleKey } from '@shared/auth/permission.constants';

export const OPERATOR_DOCUMENT_PERMISSION_CODES = {
  VIEW_STATUS: 'OPERATOR_DOCUMENT_VIEW_STATUS',
  VIEW_FULL: 'OPERATOR_DOCUMENT_VIEW_FULL',
} as const;

export type OperatorDocumentPermissionAction =
  | 'operator.documents.view_status'
  | 'operator.documents.view_full';

export interface OperatorDocumentPermissionRequirement {
  module: PermissionModuleKey;
  level: PermissionLevel;
  code: string;
}

/**
 * Operator document visibility:
 * - view_status: slot/status only (default worker via bookings.read)
 * - view_full: open ID/license and full booking PDFs (customers.read)
 */
export const OPERATOR_DOCUMENT_PERMISSION_REQUIREMENTS: Readonly<
  Record<OperatorDocumentPermissionAction, OperatorDocumentPermissionRequirement>
> = {
  'operator.documents.view_status': {
    module: 'bookings',
    level: 'read',
    code: OPERATOR_DOCUMENT_PERMISSION_CODES.VIEW_STATUS,
  },
  'operator.documents.view_full': {
    module: 'customers',
    level: 'read',
    code: OPERATOR_DOCUMENT_PERMISSION_CODES.VIEW_FULL,
  },
};
