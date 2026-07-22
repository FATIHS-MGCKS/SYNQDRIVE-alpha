export const LEGAL_DOCUMENT_ERROR_CODES = {
  ACTIVE_CONFLICT: 'LEGAL_DOCUMENT_ACTIVE_CONFLICT',
  NOT_ACTIVATABLE: 'LEGAL_DOCUMENT_NOT_ACTIVATABLE',
  INVALID_STATUS_TRANSITION: 'LEGAL_DOCUMENT_INVALID_STATUS_TRANSITION',
} as const;

export type LegalDocumentErrorCode =
  (typeof LEGAL_DOCUMENT_ERROR_CODES)[keyof typeof LEGAL_DOCUMENT_ERROR_CODES];

export interface LegalDocumentConflictBody {
  message: string;
  code: typeof LEGAL_DOCUMENT_ERROR_CODES.ACTIVE_CONFLICT;
  organizationId: string;
  documentType: string;
  language: string;
}

export const LEGAL_DOCUMENT_SINGLE_ACTIVE_INDEX = 'organization_legal_documents_single_active_key';
