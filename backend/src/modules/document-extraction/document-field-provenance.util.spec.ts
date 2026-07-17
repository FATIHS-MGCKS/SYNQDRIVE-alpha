import {
  applyFieldProvenanceConfirmations,
  buildFieldProvenanceFromStructuredFields,
  extractTextEvidenceSnippet,
  sanitizeTextEvidence,
} from './document-field-provenance.util';
import type { StructuredFieldValue } from './document-structured-extraction.types';

const structuredFields: StructuredFieldValue[] = [
  {
    key: 'invoiceNumber',
    raw: ' INV-2026-42 ',
    normalized: 'INV-2026-42',
    confidence: 0.9,
    sourcePages: [1],
    provenance: 'llm',
    conflict: false,
  },
  {
    key: 'totalCents',
    raw: 12900,
    normalized: 12900,
    confidence: 0.75,
    sourcePages: [1],
    provenance: 'merged',
    conflict: false,
  },
];

describe('document-field-provenance.util', () => {
  it('builds provenance with bounded text evidence', () => {
    const registry = buildFieldProvenanceFromStructuredFields({
      fields: structuredFields,
      pages: [
        {
          pageNumber: 1,
          text: 'Invoice INV-2026-42 total amount due 129.00 EUR',
          sourceMethod: 'OCR',
          hasReliablePageBoundaries: true,
        },
      ],
    });

    expect(registry.fields[0]).toMatchObject({
      fieldKey: 'invoiceNumber',
      rawValue: ' INV-2026-42 ',
      normalizedValue: 'INV-2026-42',
      sourceType: 'ai_extraction',
      manuallyEdited: false,
      confirmedValue: null,
    });
    expect(registry.fields[0]?.textEvidence).toContain('INV-2026-42');
    expect((registry.fields[0]?.textEvidence ?? '').length).toBeLessThanOrEqual(120);
  });

  it('sanitizes sensitive text evidence', () => {
    const sanitized = sanitizeTextEvidence('Customer M-AB 1234 contacted us', true);
    expect(sanitized).toContain('[plate]');
    expect(sanitized).not.toContain('M-AB 1234');
  });

  it('does not return full document text as evidence', () => {
    const longText = `${'A'.repeat(500)} INV-2026-42 ${'B'.repeat(500)}`;
    const snippet = extractTextEvidenceSnippet({
      value: 'INV-2026-42',
      pages: [{ pageNumber: 1, text: longText, sourceMethod: 'OCR', hasReliablePageBoundaries: true }],
      sourcePages: [1],
      fieldKey: 'invoiceNumber',
    });
    expect(snippet?.length ?? 0).toBeLessThanOrEqual(120);
    expect(snippet).not.toBe(longText);
  });

  it('tracks user corrections separately from AI values', () => {
    const base = buildFieldProvenanceFromStructuredFields({
      fields: structuredFields,
      pages: [],
    });

    const corrected = applyFieldProvenanceConfirmations({
      registry: base,
      confirmedData: {
        invoiceNumber: 'INV-USER-99',
        totalCents: 12900,
      },
      confirmedBy: 'user-1',
      confirmedAt: '2026-07-17T12:00:00.000Z',
      schemaFieldKeys: ['invoiceNumber', 'totalCents', 'eventDate'],
    });

    const invoice = corrected.fields.find((row) => row.fieldKey === 'invoiceNumber');
    const total = corrected.fields.find((row) => row.fieldKey === 'totalCents');

    expect(invoice).toMatchObject({
      normalizedValue: 'INV-2026-42',
      confirmedValue: 'INV-USER-99',
      manuallyEdited: true,
      sourceType: 'user_correction',
      confirmedBy: 'user-1',
    });
    expect(total).toMatchObject({
      manuallyEdited: false,
      sourceType: 'user_confirmed',
      confirmedValue: 12900,
    });
    expect(corrected.correctionCount).toBe(1);
    expect(corrected.correctedFieldKeys).toEqual(['invoiceNumber']);
  });
});
