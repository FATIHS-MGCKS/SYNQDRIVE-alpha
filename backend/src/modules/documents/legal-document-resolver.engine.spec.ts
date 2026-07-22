import { DOCUMENT_TYPE } from './documents.constants';
import { resolveLegalDocuments } from './legal-document-resolver.engine';
import {
  LEGAL_DOCUMENT_RESOLVER_ERROR_CODES,
  LEGAL_DOCUMENT_RESOLVER_SELECTION_REASON,
} from './legal-document-resolver.constants';
import type {
  LegalDocumentEvaluatedContext,
  LegalDocumentResolverCandidate,
} from './legal-document-resolver.types';
import { LEGAL_BOOKING_CHANNEL, LEGAL_CUSTOMER_SEGMENT } from './legal-document-scope.constants';

function ctx(overrides: Partial<LegalDocumentEvaluatedContext> = {}): LegalDocumentEvaluatedContext {
  return {
    organizationId: 'org-1',
    bookingId: 'bk-1',
    customerLanguage: 'de',
    customerSegment: 'B2C',
    jurisdiction: 'DE',
    bookingChannel: LEGAL_BOOKING_CHANNEL.WEBSITE,
    productScope: 'RENTAL',
    stationId: 'st-berlin',
    effectiveTimestamp: '2026-06-15T12:00:00.000Z',
    ...overrides,
  };
}

function candidate(
  overrides: Partial<LegalDocumentResolverCandidate> & Pick<LegalDocumentResolverCandidate, 'id' | 'documentType'>,
): LegalDocumentResolverCandidate {
  return {
    organizationId: 'org-1',
    legalVariant: null,
    title: overrides.documentType,
    versionLabel: 'v1',
    language: 'de',
    jurisdictionCountry: 'DE',
    customerSegment: LEGAL_CUSTOMER_SEGMENT.BOTH,
    bookingChannel: LEGAL_BOOKING_CHANNEL.ALL,
    productScope: null,
    stationScopeMode: 'ORGANIZATION_WIDE',
    stationIds: [],
    priority: 0,
    isMandatory: true,
    noticePurpose: 'TERMS_AND_CONDITIONS',
    status: 'ACTIVE',
    validFrom: null,
    validUntil: null,
    integrityStatus: 'VERIFIED',
    integrityUnavailable: false,
    ...overrides,
  };
}

function resolve(
  context: LegalDocumentEvaluatedContext,
  candidates: LegalDocumentResolverCandidate[],
  documentTypes?: string[],
) {
  return resolveLegalDocuments({ context, candidates, documentTypes });
}

describe('legal-document-resolver.engine', () => {
  it('resolves German B2C website booking with terms + consumer + privacy', () => {
    const candidates = [
      candidate({
        id: 'terms-de',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        noticePurpose: 'TERMS_AND_CONDITIONS',
        bookingChannel: LEGAL_BOOKING_CHANNEL.WEBSITE,
        customerSegment: LEGAL_CUSTOMER_SEGMENT.B2C,
      }),
      candidate({
        id: 'consumer-de',
        documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION,
        legalVariant: 'WITHDRAWAL_RIGHT_NOTICE',
        noticePurpose: 'WITHDRAWAL_RIGHT_NOTICE',
      }),
      candidate({
        id: 'privacy-de',
        documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
        noticePurpose: 'PRIVACY_POLICY',
      }),
    ];

    const result = resolve(ctx(), candidates);
    expect(result.isComplete).toBe(true);
    expect(result.selectedDocuments).toHaveLength(3);
    expect(result.selectedDocuments.map((s) => s.legalDocumentId)).toEqual([
      'terms-de',
      'consumer-de',
      'privacy-de',
    ]);
    expect(result.selectedDocuments[0]?.selectionReason).toBe(
      LEGAL_DOCUMENT_RESOLVER_SELECTION_REASON.SINGLE_MATCH,
    );
  });

  it('resolves English B2B booking when scoped documents exist', () => {
    const candidates = [
      candidate({
        id: 'terms-en-b2b',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        language: 'en',
        jurisdictionCountry: 'DE',
        customerSegment: LEGAL_CUSTOMER_SEGMENT.B2B,
        bookingChannel: LEGAL_BOOKING_CHANNEL.ALL,
        noticePurpose: 'TERMS_AND_CONDITIONS',
      }),
      candidate({
        id: 'terms-de',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        language: 'de',
        noticePurpose: 'TERMS_AND_CONDITIONS',
      }),
    ];

    const result = resolve(
      ctx({
        customerLanguage: 'en',
        customerSegment: 'B2B',
        bookingChannel: LEGAL_BOOKING_CHANNEL.API,
      }),
      candidates,
      [DOCUMENT_TYPE.TERMS_AND_CONDITIONS],
    );

    expect(result.selectedDocuments[0]?.legalDocumentId).toBe('terms-en-b2b');
    expect(result.missingMandatoryDocuments).toHaveLength(0);
  });

  it('resolves manual booking channel when document channel is ALL', () => {
    const result = resolve(
      ctx({ bookingChannel: LEGAL_BOOKING_CHANNEL.MANUAL }),
      [
        candidate({
          id: 'terms-manual',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          noticePurpose: 'TERMS_AND_CONDITIONS',
        }),
      ],
      [DOCUMENT_TYPE.TERMS_AND_CONDITIONS],
    );
    expect(result.selectedDocuments[0]?.legalDocumentId).toBe('terms-manual');
  });

  it('reports incomplete result when language is missing in evaluated context', () => {
    const result = resolve(
      ctx({ customerLanguage: null }),
      [
        candidate({
          id: 'terms-de',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          noticePurpose: 'TERMS_AND_CONDITIONS',
        }),
      ],
    );
    expect(result.selectedDocuments).toHaveLength(0);
    expect(result.isComplete).toBe(false);
  });

  it('reports unsupported jurisdiction when no matching document exists', () => {
    const result = resolve(
      ctx({ jurisdiction: 'FR' }),
      [
        candidate({
          id: 'terms-de',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          language: 'de',
          jurisdictionCountry: 'DE',
          noticePurpose: 'TERMS_AND_CONDITIONS',
        }),
      ],
      [DOCUMENT_TYPE.TERMS_AND_CONDITIONS],
    );
    expect(result.selectedDocuments).toHaveLength(0);
    expect(result.missingMandatoryDocuments).toHaveLength(1);
    expect(
      result.errors.some((e) => e.code === LEGAL_DOCUMENT_RESOLVER_ERROR_CODES.UNSUPPORTED_JURISDICTION),
    ).toBe(true);
  });

  it('detects overlapping rules with same priority as conflicts', () => {
    const result = resolve(
      ctx(),
      [
        candidate({
          id: 'terms-a',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          noticePurpose: 'TERMS_AND_CONDITIONS',
          priority: 5,
        }),
        candidate({
          id: 'terms-b',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          noticePurpose: 'TERMS_AND_CONDITIONS',
          priority: 5,
        }),
      ],
      [DOCUMENT_TYPE.TERMS_AND_CONDITIONS],
    );
    expect(result.conflicts).toHaveLength(1);
    expect(result.errors.some((e) => e.code === LEGAL_DOCUMENT_RESOLVER_ERROR_CODES.SCOPE_CONFLICT)).toBe(
      true,
    );
    expect(result.selectedDocuments).toHaveLength(0);
  });

  it('picks higher priority when scopes overlap', () => {
    const result = resolve(
      ctx({ bookingChannel: LEGAL_BOOKING_CHANNEL.WEBSITE }),
      [
        candidate({
          id: 'terms-low',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          noticePurpose: 'TERMS_AND_CONDITIONS',
          bookingChannel: LEGAL_BOOKING_CHANNEL.WEBSITE,
          priority: 1,
        }),
        candidate({
          id: 'terms-high',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          noticePurpose: 'TERMS_AND_CONDITIONS',
          bookingChannel: LEGAL_BOOKING_CHANNEL.ALL,
          priority: 10,
        }),
      ],
      [DOCUMENT_TYPE.TERMS_AND_CONDITIONS],
    );
    expect(result.selectedDocuments[0]?.legalDocumentId).toBe('terms-high');
    expect(result.selectedDocuments[0]?.selectionReason).toBe(
      LEGAL_DOCUMENT_RESOLVER_SELECTION_REASON.HIGHEST_PRIORITY_MATCH,
    );
  });

  it('excludes future versions (not yet valid)', () => {
    const result = resolve(
      ctx({ effectiveTimestamp: '2026-01-01T00:00:00.000Z' }),
      [
        candidate({
          id: 'terms-future',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          noticePurpose: 'TERMS_AND_CONDITIONS',
          validFrom: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ],
      [DOCUMENT_TYPE.TERMS_AND_CONDITIONS],
    );
    expect(result.selectedDocuments).toHaveLength(0);
    expect(result.missingMandatoryDocuments[0]?.reason).toMatch(/not yet valid/i);
  });

  it('excludes expired versions', () => {
    const result = resolve(
      ctx({ effectiveTimestamp: '2026-12-01T00:00:00.000Z' }),
      [
        candidate({
          id: 'terms-expired',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          noticePurpose: 'TERMS_AND_CONDITIONS',
          validUntil: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ],
      [DOCUMENT_TYPE.TERMS_AND_CONDITIONS],
    );
    expect(result.selectedDocuments).toHaveLength(0);
    expect(result.missingMandatoryDocuments[0]?.reason).toMatch(/expired/i);
  });

  it('excludes revoked versions', () => {
    const result = resolve(
      ctx(),
      [
        candidate({
          id: 'terms-revoked',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          noticePurpose: 'TERMS_AND_CONDITIONS',
          status: 'REVOKED',
        }),
      ],
      [DOCUMENT_TYPE.TERMS_AND_CONDITIONS],
    );
    expect(result.selectedDocuments).toHaveLength(0);
  });

  it('excludes non-ACTIVE scheduled/approved versions', () => {
    const result = resolve(
      ctx(),
      [
        candidate({
          id: 'terms-scheduled',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          noticePurpose: 'TERMS_AND_CONDITIONS',
          status: 'SCHEDULED',
        }),
      ],
      [DOCUMENT_TYPE.TERMS_AND_CONDITIONS],
    );
    expect(result.selectedDocuments).toHaveLength(0);
  });

  it('selects station-specific rule when station matches', () => {
    const result = resolve(
      ctx({ stationId: 'st-munich' }),
      [
        candidate({
          id: 'terms-munich',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          noticePurpose: 'TERMS_AND_CONDITIONS',
          stationScopeMode: 'STATION_SPECIFIC',
          stationIds: ['st-munich'],
          priority: 10,
        }),
        candidate({
          id: 'terms-org',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          noticePurpose: 'TERMS_AND_CONDITIONS',
          stationScopeMode: 'ORGANIZATION_WIDE',
          priority: 0,
        }),
      ],
      [DOCUMENT_TYPE.TERMS_AND_CONDITIONS],
    );
    expect(result.selectedDocuments[0]?.legalDocumentId).toBe('terms-munich');
  });

  it('selects organization-wide rule for station booking when no station-specific doc exists', () => {
    const result = resolve(
      ctx({ stationId: 'st-hamburg' }),
      [
        candidate({
          id: 'terms-org',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          noticePurpose: 'TERMS_AND_CONDITIONS',
          stationScopeMode: 'ORGANIZATION_WIDE',
        }),
      ],
      [DOCUMENT_TYPE.TERMS_AND_CONDITIONS],
    );
    expect(result.selectedDocuments[0]?.legalDocumentId).toBe('terms-org');
    expect(result.selectedDocuments[0]?.selectionReason).toBe(
      LEGAL_DOCUMENT_RESOLVER_SELECTION_REASON.SINGLE_MATCH,
    );
  });

  it('separates B2B from B2C when document segment is specific', () => {
    const result = resolve(
      ctx({ customerSegment: 'B2B' }),
      [
        candidate({
          id: 'terms-b2c-only',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          noticePurpose: 'TERMS_AND_CONDITIONS',
          customerSegment: LEGAL_CUSTOMER_SEGMENT.B2C,
        }),
      ],
      [DOCUMENT_TYPE.TERMS_AND_CONDITIONS],
    );
    expect(result.selectedDocuments).toHaveLength(0);
  });

  it('returns structured result contract fields', () => {
    const result = resolve(ctx(), [
      candidate({
        id: 'terms-de',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        noticePurpose: 'TERMS_AND_CONDITIONS',
      }),
    ]);
    expect(result.resolverVersion).toMatch(/legal-document-resolver-v/);
    expect(result.evaluatedAt).toBeTruthy();
    expect(result.evaluatedContext.organizationId).toBe('org-1');
    expect(result.evaluatedContext.customerLanguage).toBe('de');
  });
});
