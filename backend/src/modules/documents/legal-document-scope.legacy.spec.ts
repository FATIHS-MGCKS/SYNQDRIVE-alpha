import { LEGAL_DOCUMENT_LEGACY_SCOPE_DEFAULTS } from './legal-document-scope.constants';
import { toLegalDocumentScopeShape } from './legal-document-scope.util';

describe('legal-document-scope legacy documents', () => {
  it('maps migrated legacy rows to documented default scope dimensions', () => {
    const legacyRow = {
      id: 'legacy-1',
      organizationId: 'org-1',
      documentType: 'TERMS_AND_CONDITIONS',
      legalVariant: null,
      language: 'de',
      jurisdictionCountry: 'DE',
      customerSegment: 'BOTH',
      bookingChannel: 'ALL',
      productScope: null,
      stationScopeMode: 'ORGANIZATION_WIDE',
      priority: 0,
      isMandatory: true,
      noticePurpose: 'TERMS_AND_CONDITIONS',
      validFrom: null,
      validUntil: null,
      status: 'ACTIVE',
      stations: [],
    };

    const shape = toLegalDocumentScopeShape(legacyRow as never);
    expect(shape.language).toBe(LEGAL_DOCUMENT_LEGACY_SCOPE_DEFAULTS.language);
    expect(shape.jurisdictionCountry).toBe(LEGAL_DOCUMENT_LEGACY_SCOPE_DEFAULTS.jurisdictionCountry);
    expect(shape.customerSegment).toBe(LEGAL_DOCUMENT_LEGACY_SCOPE_DEFAULTS.customerSegment);
    expect(shape.bookingChannel).toBe(LEGAL_DOCUMENT_LEGACY_SCOPE_DEFAULTS.bookingChannel);
    expect(shape.stationScopeMode).toBe(LEGAL_DOCUMENT_LEGACY_SCOPE_DEFAULTS.stationScopeMode);
    expect(shape.priority).toBe(LEGAL_DOCUMENT_LEGACY_SCOPE_DEFAULTS.priority);
    expect(shape.stationIds).toEqual([]);
  });
});
