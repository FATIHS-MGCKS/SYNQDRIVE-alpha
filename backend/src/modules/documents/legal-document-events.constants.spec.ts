import { resolveLegalDocumentEventType, deriveJurisdictionFromLanguage } from './legal-document-events.constants';
import { LEGAL_STATUS } from './documents.constants';
import { LEGAL_DOCUMENT_EVENT_TYPE } from './legal-document-events.constants';

describe('legal-document-events.constants', () => {
  it('maps lifecycle transitions to event types', () => {
    expect(resolveLegalDocumentEventType(null, LEGAL_STATUS.DRAFT)).toBe(
      LEGAL_DOCUMENT_EVENT_TYPE.UPLOADED,
    );
    expect(resolveLegalDocumentEventType(LEGAL_STATUS.DRAFT, LEGAL_STATUS.IN_REVIEW)).toBe(
      LEGAL_DOCUMENT_EVENT_TYPE.SUBMITTED_FOR_REVIEW,
    );
    expect(resolveLegalDocumentEventType(LEGAL_STATUS.IN_REVIEW, LEGAL_STATUS.DRAFT)).toBe(
      LEGAL_DOCUMENT_EVENT_TYPE.RETURNED_TO_DRAFT,
    );
    expect(resolveLegalDocumentEventType(LEGAL_STATUS.IN_REVIEW, LEGAL_STATUS.APPROVED)).toBe(
      LEGAL_DOCUMENT_EVENT_TYPE.APPROVED,
    );
    expect(resolveLegalDocumentEventType(LEGAL_STATUS.APPROVED, LEGAL_STATUS.SCHEDULED)).toBe(
      LEGAL_DOCUMENT_EVENT_TYPE.SCHEDULED,
    );
    expect(resolveLegalDocumentEventType(LEGAL_STATUS.SCHEDULED, LEGAL_STATUS.ACTIVE)).toBe(
      LEGAL_DOCUMENT_EVENT_TYPE.ACTIVATED,
    );
    expect(resolveLegalDocumentEventType(LEGAL_STATUS.ACTIVE, LEGAL_STATUS.SUPERSEDED)).toBe(
      LEGAL_DOCUMENT_EVENT_TYPE.SUPERSEDED,
    );
    expect(resolveLegalDocumentEventType(LEGAL_STATUS.ACTIVE, LEGAL_STATUS.REVOKED)).toBe(
      LEGAL_DOCUMENT_EVENT_TYPE.REVOKED,
    );
    expect(resolveLegalDocumentEventType(LEGAL_STATUS.SUPERSEDED, LEGAL_STATUS.ARCHIVED)).toBe(
      LEGAL_DOCUMENT_EVENT_TYPE.ARCHIVED,
    );
  });

  it('derives jurisdiction from language without document content', () => {
    expect(deriveJurisdictionFromLanguage('de')).toBe('DE');
    expect(deriveJurisdictionFromLanguage('en')).toBeNull();
  });
});
