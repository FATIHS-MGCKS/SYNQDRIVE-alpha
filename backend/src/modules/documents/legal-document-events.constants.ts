import { LEGAL_STATUS } from './documents.constants';

export const LEGAL_DOCUMENT_EVENT_TYPE = {
  UPLOADED: 'UPLOADED',
  SUBMITTED_FOR_REVIEW: 'SUBMITTED_FOR_REVIEW',
  RETURNED_TO_DRAFT: 'RETURNED_TO_DRAFT',
  APPROVED: 'APPROVED',
  SCHEDULED: 'SCHEDULED',
  ACTIVATED: 'ACTIVATED',
  SUPERSEDED: 'SUPERSEDED',
  REVOKED: 'REVOKED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type LegalDocumentEventType =
  (typeof LEGAL_DOCUMENT_EVENT_TYPE)[keyof typeof LEGAL_DOCUMENT_EVENT_TYPE];

/** Maps a lifecycle transition to its append-only audit event type. */
export function resolveLegalDocumentEventType(
  previousStatus: string | null,
  newStatus: string,
): LegalDocumentEventType {
  if (previousStatus === null) {
    return LEGAL_DOCUMENT_EVENT_TYPE.UPLOADED;
  }
  if (
    newStatus === LEGAL_STATUS.DRAFT &&
    previousStatus === LEGAL_STATUS.IN_REVIEW
  ) {
    return LEGAL_DOCUMENT_EVENT_TYPE.RETURNED_TO_DRAFT;
  }
  switch (newStatus) {
    case LEGAL_STATUS.IN_REVIEW:
      return LEGAL_DOCUMENT_EVENT_TYPE.SUBMITTED_FOR_REVIEW;
    case LEGAL_STATUS.APPROVED:
      return LEGAL_DOCUMENT_EVENT_TYPE.APPROVED;
    case LEGAL_STATUS.SCHEDULED:
      return LEGAL_DOCUMENT_EVENT_TYPE.SCHEDULED;
    case LEGAL_STATUS.ACTIVE:
      return LEGAL_DOCUMENT_EVENT_TYPE.ACTIVATED;
    case LEGAL_STATUS.SUPERSEDED:
      return LEGAL_DOCUMENT_EVENT_TYPE.SUPERSEDED;
    case LEGAL_STATUS.REVOKED:
      return LEGAL_DOCUMENT_EVENT_TYPE.REVOKED;
    case LEGAL_STATUS.ARCHIVED:
      return LEGAL_DOCUMENT_EVENT_TYPE.ARCHIVED;
    default:
      throw new Error(
        `No legal document event type for transition ${previousStatus} → ${newStatus}`,
      );
  }
}

/** Best-effort jurisdiction snapshot from document language (no document content). */
export function deriveJurisdictionFromLanguage(language: string): string | null {
  const normalized = (language || '').trim().toLowerCase();
  if (normalized === 'de') return 'DE';
  if (normalized === 'at') return 'AT';
  if (normalized === 'ch') return 'CH';
  return null;
}
