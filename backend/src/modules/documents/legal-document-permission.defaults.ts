import type { MembershipPermissionsMap } from '@shared/auth/permission.util';

const all = (read: boolean, write: boolean, manage = false) => ({ read, write, manage });

/** Full legal-document access (view/upload/lifecycle + audit + publish). */
export function legalDocumentFullPermissions(): MembershipPermissionsMap {
  return {
    'legal-documents': all(true, true, true),
    'legal-documents-audit': all(true, false, false),
  };
}

/** Read-only legal documents + audit trail (compliance / sub-admin view). */
export function legalDocumentReadPermissions(): MembershipPermissionsMap {
  return {
    'legal-documents': all(true, false, false),
    'legal-documents-audit': all(true, false, false),
  };
}

/** Operational legal editor — upload and prepare versions, no approve/activate. */
export function legalDocumentEditorPermissions(): MembershipPermissionsMap {
  return {
    'legal-documents': all(true, true, false),
    'legal-documents-audit': all(true, false, false),
  };
}

/** Baseline read for org members who could previously list legal documents. */
export function legalDocumentViewerPermissions(): MembershipPermissionsMap {
  return {
    'legal-documents': all(true, false, false),
    'legal-documents-audit': all(false, false, false),
  };
}
