import { SUPPORTED_DOCUMENT_TYPES } from './document-extraction.schemas';
import {
  normalizeDocumentSubtype,
  resolveDocumentTaxonomy,
  resolveDocumentTaxonomyFromLegacyType,
  resolveLegacyDocumentTypeFromTaxonomy,
} from './document-taxonomy.util';

describe('document-taxonomy.util legacy mapping', () => {
  it('maps every supported legacy document type to category and subtype', () => {
    for (const legacyType of SUPPORTED_DOCUMENT_TYPES) {
      const taxonomy = resolveDocumentTaxonomyFromLegacyType(legacyType);
      expect(taxonomy.documentCategory).toBeTruthy();
      expect(taxonomy.documentSubtype).toBeTruthy();
      expect(taxonomy.legacyDocumentType).toBe(legacyType);
      expect(taxonomy.taxonomyVersion).toBe('1.0.0');
    }
  });

  it('maps legacy INVOICE to FINANCE / INVOICE', () => {
    expect(resolveDocumentTaxonomyFromLegacyType('INVOICE')).toMatchObject({
      documentCategory: 'FINANCE',
      documentSubtype: 'INVOICE',
      legacyDocumentType: 'INVOICE',
    });
  });

  it('maps legacy FINE to AUTHORITY / FINE_NOTICE', () => {
    expect(resolveDocumentTaxonomyFromLegacyType('FINE')).toMatchObject({
      documentCategory: 'AUTHORITY',
      documentSubtype: 'FINE_NOTICE',
      legacyDocumentType: 'FINE',
    });
  });

  it('maps legacy SERVICE family to TECHNICAL / SERVICE_REPORT', () => {
    for (const legacyType of ['SERVICE', 'OIL_CHANGE', 'TIRE', 'BRAKE', 'BATTERY'] as const) {
      expect(resolveDocumentTaxonomyFromLegacyType(legacyType)).toMatchObject({
        documentCategory: 'TECHNICAL',
        documentSubtype: 'SERVICE_REPORT',
        legacyDocumentType: legacyType,
      });
    }
  });

  it('maps legacy compliance reports', () => {
    expect(resolveDocumentTaxonomyFromLegacyType('TUV_REPORT')).toMatchObject({
      documentCategory: 'COMPLIANCE',
      documentSubtype: 'TUV_REPORT',
    });
    expect(resolveDocumentTaxonomyFromLegacyType('BOKRAFT_REPORT')).toMatchObject({
      documentCategory: 'COMPLIANCE',
      documentSubtype: 'BOKRAFT_REPORT',
    });
  });

  it('maps finance subtype hints from extracted data', () => {
    expect(
      resolveDocumentTaxonomy({
        legacyDocumentType: 'INVOICE',
        documentSubtype: 'CREDIT_NOTE',
      }),
    ).toMatchObject({
      documentCategory: 'FINANCE',
      documentSubtype: 'CREDIT_NOTE',
      legacyDocumentType: 'INVOICE',
      source: 'subtype_hint',
    });

    expect(
      resolveDocumentTaxonomy({
        legacyDocumentType: 'INVOICE',
        documentSubtype: 'MAHNUNG',
      }),
    ).toMatchObject({
      documentCategory: 'FINANCE',
      documentSubtype: 'REMINDER',
    });
  });

  it('maps archive correspondence subtypes to customer/driver/insurance categories', () => {
    expect(
      resolveDocumentTaxonomy({
        legacyDocumentType: 'OTHER',
        archiveSubtype: 'CUSTOMER_CORRESPONDENCE',
      }),
    ).toMatchObject({
      documentCategory: 'CUSTOMER',
      documentSubtype: 'CUSTOMER_CORRESPONDENCE',
      legacyDocumentType: 'OTHER',
    });

    expect(
      resolveDocumentTaxonomy({
        legacyDocumentType: 'OTHER',
        archiveSubtype: 'DRIVER_DOCUMENT',
      }),
    ).toMatchObject({
      documentCategory: 'DRIVER',
      documentSubtype: 'DRIVER_DOCUMENT',
    });
  });

  it('archives unknown subtypes safely as GENERAL / OTHER', () => {
    const taxonomy = resolveDocumentTaxonomy({
      legacyDocumentType: 'INVOICE',
      documentSubtype: 'TOTALLY_NEW_SUBTYPE_XYZ',
    });
    expect(taxonomy).toMatchObject({
      documentCategory: 'GENERAL',
      documentSubtype: 'OTHER',
      legacyDocumentType: 'OTHER',
      archiveRecommended: true,
      source: 'unknown_subtype_archive',
    });
  });

  it('resolves reverse legacy type from taxonomy for apply compatibility', () => {
    expect(resolveLegacyDocumentTypeFromTaxonomy('FINANCE', 'CREDIT_NOTE')).toBe('INVOICE');
    expect(resolveLegacyDocumentTypeFromTaxonomy('COMPLIANCE', 'TUV_REPORT')).toBe('TUV_REPORT');
    expect(resolveLegacyDocumentTypeFromTaxonomy('GENERAL', 'OTHER')).toBe('OTHER');
    expect(resolveLegacyDocumentTypeFromTaxonomy('CONTRACT', 'OTHER')).toBe('OTHER');
  });

  it('normalizes subtype aliases without data loss', () => {
    expect(normalizeDocumentSubtype('credit-note')).toBe('CREDIT_NOTE');
    expect(normalizeDocumentSubtype('Zahlungsnachweis')).toBe('PAYMENT_PROOF');
    expect(normalizeDocumentSubtype('werkstattbericht')).toBe('SERVICE_REPORT');
  });
});
