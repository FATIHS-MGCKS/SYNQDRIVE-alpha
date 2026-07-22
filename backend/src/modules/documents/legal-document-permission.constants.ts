import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import type { PermissionModuleKey } from '@shared/auth/permission.constants';

/**
 * Stable permission codes for documentation, audit logs, and UI labels.
 * Enforced server-side via mapped module+level membership JSON — never client-declared.
 */
export const LEGAL_DOCUMENT_PERMISSION_CODES = {
  VIEW: 'LEGAL_DOCUMENT_VIEW',
  UPLOAD: 'LEGAL_DOCUMENT_UPLOAD',
  SUBMIT_REVIEW: 'LEGAL_DOCUMENT_SUBMIT_REVIEW',
  APPROVE: 'LEGAL_DOCUMENT_APPROVE',
  ACTIVATE: 'LEGAL_DOCUMENT_ACTIVATE',
  REVOKE: 'LEGAL_DOCUMENT_REVOKE',
  ARCHIVE: 'LEGAL_DOCUMENT_ARCHIVE',
  AUDIT_VIEW: 'LEGAL_DOCUMENT_AUDIT_VIEW',
  OVERRIDE_HANDOVER: 'LEGAL_DOCUMENT_OVERRIDE_HANDOVER',
  MANAGE_LEGAL_HOLD: 'LEGAL_DOCUMENT_MANAGE_LEGAL_HOLD',
  RETENTION_ADMIN: 'LEGAL_DOCUMENT_RETENTION_ADMIN',
} as const;

export type LegalDocumentPermissionCode =
  (typeof LEGAL_DOCUMENT_PERMISSION_CODES)[keyof typeof LEGAL_DOCUMENT_PERMISSION_CODES];

/**
 * Granular legal-document actions for Administration → Rechtliche Dokumente.
 * Mapped to `{ module, read|write|manage }` membership JSON (same pattern as tasks/payments).
 */
export const LEGAL_DOCUMENT_PERMISSION_ACTIONS = [
  'legal_documents.view',
  'legal_documents.upload',
  'legal_documents.submit_review',
  'legal_documents.approve',
  'legal_documents.activate',
  'legal_documents.revoke',
  'legal_documents.archive',
  'legal_documents.audit_view',
  'legal_documents.schedule',
  'legal_documents.manage_scope',
  'legal_documents.override_handover',
  'legal_documents.manage_legal_hold',
  'legal_documents.retention_admin',
] as const;

export type LegalDocumentPermissionAction =
  (typeof LEGAL_DOCUMENT_PERMISSION_ACTIONS)[number];

export interface LegalDocumentPermissionRequirement {
  module: PermissionModuleKey;
  level: PermissionLevel;
  code: LegalDocumentPermissionCode;
}

export const LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS: Readonly<
  Record<LegalDocumentPermissionAction, LegalDocumentPermissionRequirement>
> = {
  'legal_documents.view': {
    module: 'legal-documents',
    level: 'read',
    code: LEGAL_DOCUMENT_PERMISSION_CODES.VIEW,
  },
  'legal_documents.upload': {
    module: 'legal-documents',
    level: 'write',
    code: LEGAL_DOCUMENT_PERMISSION_CODES.UPLOAD,
  },
  'legal_documents.submit_review': {
    module: 'legal-documents',
    level: 'write',
    code: LEGAL_DOCUMENT_PERMISSION_CODES.SUBMIT_REVIEW,
  },
  'legal_documents.schedule': {
    module: 'legal-documents',
    level: 'write',
    code: LEGAL_DOCUMENT_PERMISSION_CODES.SUBMIT_REVIEW,
  },
  'legal_documents.manage_scope': {
    module: 'legal-documents',
    level: 'write',
    code: LEGAL_DOCUMENT_PERMISSION_CODES.SUBMIT_REVIEW,
  },
  'legal_documents.archive': {
    module: 'legal-documents',
    level: 'write',
    code: LEGAL_DOCUMENT_PERMISSION_CODES.ARCHIVE,
  },
  'legal_documents.approve': {
    module: 'legal-documents',
    level: 'manage',
    code: LEGAL_DOCUMENT_PERMISSION_CODES.APPROVE,
  },
  'legal_documents.activate': {
    module: 'legal-documents',
    level: 'manage',
    code: LEGAL_DOCUMENT_PERMISSION_CODES.ACTIVATE,
  },
  'legal_documents.revoke': {
    module: 'legal-documents',
    level: 'manage',
    code: LEGAL_DOCUMENT_PERMISSION_CODES.REVOKE,
  },
  'legal_documents.override_handover': {
    module: 'legal-documents',
    level: 'manage',
    code: LEGAL_DOCUMENT_PERMISSION_CODES.OVERRIDE_HANDOVER,
  },
  'legal_documents.manage_legal_hold': {
    module: 'legal-documents',
    level: 'manage',
    code: LEGAL_DOCUMENT_PERMISSION_CODES.MANAGE_LEGAL_HOLD,
  },
  'legal_documents.retention_admin': {
    module: 'legal-documents',
    level: 'manage',
    code: LEGAL_DOCUMENT_PERMISSION_CODES.RETENTION_ADMIN,
  },
  'legal_documents.audit_view': {
    module: 'legal-documents-audit',
    level: 'read',
    code: LEGAL_DOCUMENT_PERMISSION_CODES.AUDIT_VIEW,
  },
};

export function isLegalDocumentPermissionAction(
  value: string,
): value is LegalDocumentPermissionAction {
  return (LEGAL_DOCUMENT_PERMISSION_ACTIONS as readonly string[]).includes(value);
}
