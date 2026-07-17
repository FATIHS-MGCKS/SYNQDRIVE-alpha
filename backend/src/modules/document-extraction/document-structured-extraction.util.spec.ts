import type { FieldExtractionEvidence } from '@modules/ai/documents/document-extraction-merge.service';
import {
  archiveSupersededExtractionRun,
  buildNormalizedFlatFromSchema,
  buildStructuredExtractionPayload,
  buildStructuredFieldValues,
  collectMissingRequiredFields,
  isFieldPresent,
  readSupersededExtractionRuns,
} from './document-structured-extraction.util';
import type { ResolvedExtractionSchema } from './document-structured-extraction.types';

const invoiceSchema: ResolvedExtractionSchema = {
  legacyDocumentType: 'INVOICE',
  documentSubtype: 'INVOICE',
  schemaVersion: '1.0.0',
  requiredFields: ['invoiceNumber', 'totalCents', 'eventDate'],
  fields: [
    { key: 'invoiceNumber', label: 'Invoice number', type: 'string' },
    { key: 'totalCents', label: 'Total', type: 'number' },
    { key: 'eventDate', label: 'Date', type: 'date' },
  ],
};

describe('document-structured-extraction.util', () => {
  it('separates raw and normalized values with provenance', () => {
    const evidence: FieldExtractionEvidence[] = [
      {
        key: 'invoiceNumber',
        selectedValue: 'INV-1001',
        candidateValues: [{ value: ' INV-1001 ', sourcePages: [1], chunkIndex: 0 }],
        sourcePages: [1],
        conflict: false,
      },
    ];
    const normalizedFlat = buildNormalizedFlatFromSchema(invoiceSchema.fields, {
      invoiceNumber: ' INV-1001 ',
      totalCents: null,
      eventDate: null,
    });
    const fields = buildStructuredFieldValues({
      schemaFields: invoiceSchema.fields,
      normalizedFlat,
      fieldEvidence: evidence,
    });

    expect(fields[0]).toMatchObject({
      key: 'invoiceNumber',
      raw: ' INV-1001 ',
      normalized: 'INV-1001',
      provenance: 'llm',
      confidence: 0.9,
      sourcePages: [1],
    });
    expect(fields[1]?.provenance).toBe('missing');
    expect(fields[1]?.normalized).toBeNull();
  });

  it('marks conflicts and missing required fields explicitly', () => {
    const payload = buildStructuredExtractionPayload({
      resolvedSchema: invoiceSchema,
      agentResult: {
        fields: { invoiceNumber: 'INV-1', totalCents: null, eventDate: null },
        fieldEvidence: [
          {
            key: 'totalCents',
            selectedValue: null,
            candidateValues: [
              { value: 12000, sourcePages: [1], chunkIndex: 0 },
              { value: 12900, sourcePages: [2], chunkIndex: 1 },
            ],
            sourcePages: [1, 2],
            conflict: true,
          },
        ],
        extractionConflicts: [
          {
            key: 'totalCents',
            selectedValue: null,
            candidateValues: [
              { value: 12000, sourcePages: [1], chunkIndex: 0 },
              { value: 12900, sourcePages: [2], chunkIndex: 1 },
            ],
            sourcePages: [1, 2],
            conflict: true,
          },
        ],
      },
    });

    expect(payload.missingFields).toEqual(['totalCents', 'eventDate']);
    expect(payload.conflicts).toEqual(['totalCents']);
    expect(payload.normalizedFlat.invoiceNumber).toBe('INV-1');
    expect(isFieldPresent(payload.normalizedFlat.totalCents)).toBe(false);
    expect(collectMissingRequiredFields(invoiceSchema.requiredFields, payload.normalizedFlat)).toEqual(
      ['totalCents', 'eventDate'],
    );
  });

  it('archives prior extraction run instead of silent overwrite', () => {
    const priorPlausibility = {
      _pipeline: {
        structuredExtraction: {
          contractVersion: '1.0.0',
          schemaVersion: '1.0.0',
          documentSubtype: 'INVOICE',
          legacyDocumentType: 'INVOICE',
          fields: [],
          missingFields: [],
          conflicts: [],
          normalizedFlat: { invoiceNumber: 'OLD-1' },
        },
        structuredExtractionRun: {
          runId: 'run-old',
          contractVersion: '1.0.0',
          schemaVersion: '1.0.0',
          documentSubtype: 'INVOICE',
          legacyDocumentType: 'INVOICE',
          trigger: 'auto',
          startedAt: '2026-07-17T10:00:00.000Z',
          completedAt: '2026-07-17T10:00:01.000Z',
          provider: 'mistral',
          modelVersion: 'mistral-small',
          fieldCount: 1,
          missingFieldCount: 0,
          conflictCount: 0,
        },
      },
    };

    const archived = archiveSupersededExtractionRun({
      plausibility: priorPlausibility,
      extractedData: { invoiceNumber: 'OLD-1' },
      supersededReason: 'type_change',
      previousDocumentType: 'INVOICE',
      nextDocumentType: 'SERVICE',
    });

    const superseded = readSupersededExtractionRuns(archived);
    expect(superseded).toHaveLength(1);
    expect(superseded[0]?.extractedData).toEqual({ invoiceNumber: 'OLD-1' });
    expect(superseded[0]?.supersededReason).toBe('type_change');
    expect((archived._pipeline as Record<string, unknown>).structuredExtraction).toBeNull();
  });
});
