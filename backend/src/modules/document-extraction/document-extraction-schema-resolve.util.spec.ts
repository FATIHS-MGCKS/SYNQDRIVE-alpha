import { mergeDocumentTaxonomyPipeline } from './document-taxonomy.util';
import { resolveDocumentTaxonomyFromLegacyType } from './document-taxonomy.util';
import { resolveExtractionSchema, resolveExtractionTrigger } from './document-extraction-schema-resolve.util';
import { appendDocumentTypeAudit } from './document-content-cache.util';

describe('document-extraction-schema-resolve.util', () => {
  it('resolves schema from confirmed taxonomy subtype', () => {
    const plausibility = mergeDocumentTaxonomyPipeline(
      {},
      resolveDocumentTaxonomyFromLegacyType('INVOICE', 'manual_type'),
    );
    const resolved = resolveExtractionSchema({
      legacyDocumentType: 'INVOICE',
      plausibility,
    });
    expect(resolved.documentSubtype).toBe('INVOICE');
    expect(resolved.fields.some((field) => field.key === 'invoiceNumber')).toBe(true);
    expect(resolved.requiredFields).toContain('invoiceNumber');
  });

  it('uses high-confidence classification subtype for AUTO extraction', () => {
    const plausibility = {
      classification: {
        subtype: 'CREDIT_NOTE',
        confidence: 0.91,
        documentSubtype: 'CREDIT_NOTE',
      },
    };
    const resolved = resolveExtractionSchema({
      legacyDocumentType: 'INVOICE',
      plausibility,
    });
    expect(resolved.documentSubtype).toBe('CREDIT_NOTE');
    expect(resolved.requiredFields).toContain('invoiceNumber');
  });

  it('detects re-extraction trigger from document type audit', () => {
    const plausibility = appendDocumentTypeAudit({}, {
      from: 'INVOICE',
      to: 'SERVICE',
      at: new Date().toISOString(),
      reason: 'user_corrected_document_type_reextract',
    });
    expect(resolveExtractionTrigger(plausibility)).toBe('reextract');
  });

  it('defaults to auto trigger for first extraction', () => {
    expect(resolveExtractionTrigger({})).toBe('auto');
  });
});
