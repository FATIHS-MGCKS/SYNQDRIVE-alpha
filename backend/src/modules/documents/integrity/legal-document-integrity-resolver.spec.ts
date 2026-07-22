import {
  isLegalDocumentIntegrityBlocking,
  LEGAL_DOCUMENT_INTEGRITY_STATUS,
} from './legal-document-integrity.constants';
import { documentMatchesContext } from '../legal-document-resolver.matching';
import type { LegalDocumentResolverCandidate } from '../legal-document-resolver.types';

describe('legal document integrity resolver gate', () => {
  const baseCandidate: LegalDocumentResolverCandidate = {
    id: 'doc-1',
    organizationId: 'org-1',
    documentType: 'TERMS_AND_CONDITIONS',
    legalVariant: null,
    title: 'AGB',
    versionLabel: 'v1',
    language: 'de',
    jurisdictionCountry: 'DE',
    customerSegment: 'BOTH',
    bookingChannel: 'ALL',
    productScope: null,
    stationScopeMode: 'ORGANIZATION_WIDE',
    stationIds: [],
    priority: 0,
    isMandatory: true,
    noticePurpose: 'GENERAL_NOTICE',
    status: 'ACTIVE',
    validFrom: null,
    validUntil: null,
    integrityStatus: LEGAL_DOCUMENT_INTEGRITY_STATUS.VERIFIED,
    integrityUnavailable: false,
  };

  const ctx = {
    organizationId: 'org-1',
    bookingId: null,
    customerLanguage: 'de',
    customerSegment: 'B2C' as const,
    jurisdiction: 'DE',
    bookingChannel: 'ALL',
    productScope: null,
    stationId: null,
    effectiveTimestamp: new Date().toISOString(),
  };

  it('blocks candidates with checksum mismatch for new bookings', () => {
    const result = documentMatchesContext(
      {
        ...baseCandidate,
        integrityStatus: LEGAL_DOCUMENT_INTEGRITY_STATUS.CHECKSUM_MISMATCH,
        integrityUnavailable: true,
      },
      ctx,
      new Date(),
    );
    expect(result.matches).toBe(false);
    expect(result.reason).toBe('INTEGRITY_UNAVAILABLE');
  });

  it('allows verified candidates', () => {
    const result = documentMatchesContext(baseCandidate, ctx, new Date());
    expect(result.matches).toBe(true);
  });

  it('identifies blocking integrity statuses', () => {
    expect(isLegalDocumentIntegrityBlocking(LEGAL_DOCUMENT_INTEGRITY_STATUS.MISSING_OBJECT)).toBe(
      true,
    );
    expect(isLegalDocumentIntegrityBlocking(LEGAL_DOCUMENT_INTEGRITY_STATUS.VERIFIED)).toBe(false);
  });
});
