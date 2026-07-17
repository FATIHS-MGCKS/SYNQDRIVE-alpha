import { describe, expect, it } from 'vitest';
import {
  buildSchemaReviewGroups,
  flattenSchemaReviewGroups,
  hasSavedFieldReview,
  isCurrencySchemaField,
  maskSensitiveValue,
  parseSchemaReviewFieldsForSave,
  resolveSchemaFieldType,
} from './document-schema-field-review';
import type { PublicDocumentSubtypeSchema } from './document-extraction.types';

function invoiceSchema(): PublicDocumentSubtypeSchema {
  return {
    subtype: 'INVOICE',
    category: 'FINANCE',
    schemaVersion: '1.0.0',
    legacyDocumentTypes: ['INVOICE'],
    requiredFields: ['invoiceNumber', 'invoiceDate', 'totalGross'],
    plausibilityRules: ['invoice'],
    entityResolvers: ['vendor'],
    allowedActions: [{ semanticAction: 'CREATE_INVOICE_DRAFT', requirement: 'REQUIRED' }],
    followUpSuggestionRules: [],
    fields: [
      { key: 'invoiceNumber', label: 'Invoice number', type: 'string', required: true, uiGroup: 'finance', order: 1 },
      { key: 'invoiceDate', label: 'Invoice date', type: 'date', required: true, uiGroup: 'event', order: 2 },
      { key: 'supplier', label: 'Supplier', type: 'string', sensitive: true, uiGroup: 'parties', order: 3 },
      { key: 'totalGross', label: 'Total gross', type: 'number', required: true, uiGroup: 'finance', order: 4 },
      { key: 'currency', label: 'Currency', type: 'string', uiGroup: 'finance', order: 5 },
    ],
  };
}

function fineSchema(): PublicDocumentSubtypeSchema {
  return {
    subtype: 'FINE_NOTICE',
    category: 'AUTHORITY',
    schemaVersion: '1.0.0',
    legacyDocumentTypes: ['FINE'],
    requiredFields: ['offenseDate', 'amountCents'],
    plausibilityRules: ['fine'],
    entityResolvers: ['vehicle', 'driver'],
    allowedActions: [{ semanticAction: 'CREATE_FINE_DRAFT', requirement: 'REQUIRED' }],
    followUpSuggestionRules: [],
    fields: [
      { key: 'offenseDate', label: 'Offense date', type: 'date', required: true, uiGroup: 'event', order: 1 },
      { key: 'dueDate', label: 'Due date', type: 'date', uiGroup: 'deadlines', order: 2 },
      { key: 'licensePlate', label: 'License plate', type: 'string', sensitive: true, uiGroup: 'vehicle', order: 3 },
      { key: 'amountCents', label: 'Amount', type: 'number', required: true, uiGroup: 'finance', order: 4 },
      { key: 'issuingAuthority', label: 'Authority', type: 'string', uiGroup: 'authority', order: 5 },
    ],
  };
}

function serviceSchema(): PublicDocumentSubtypeSchema {
  return {
    subtype: 'SERVICE_REPORT',
    category: 'MAINTENANCE',
    schemaVersion: '1.0.0',
    legacyDocumentTypes: ['SERVICE'],
    requiredFields: ['eventDate', 'odometerKm'],
    plausibilityRules: ['none'],
    entityResolvers: ['vehicle'],
    allowedActions: [{ semanticAction: 'CREATE_SERVICE_EVENT', requirement: 'OPTIONAL' }],
    followUpSuggestionRules: [],
    fields: [
      { key: 'eventDate', label: 'Service date', type: 'date', required: true, uiGroup: 'event', order: 1 },
      { key: 'odometerKm', label: 'Odometer', type: 'number', required: true, uiGroup: 'vehicle', order: 2 },
      { key: 'workshopName', label: 'Workshop', type: 'string', uiGroup: 'parties', order: 3 },
      { key: 'description', label: 'Description', type: 'string', uiGroup: 'content', order: 4 },
      { key: 'costCents', label: 'Cost', type: 'number', uiGroup: 'finance', order: 5 },
    ],
  };
}

describe('document-schema-field-review', () => {
  it('maps schema field types including currency cents fields', () => {
    expect(resolveSchemaFieldType({ key: 'invoiceDate', label: 'Date', type: 'date' })).toBe('date');
    expect(resolveSchemaFieldType({ key: 'totalGross', label: 'Total', type: 'number' })).toBe('currency');
    expect(isCurrencySchemaField('amountCents')).toBe(true);
  });

  it('builds grouped INVOICE review with localized currency and missing required markers', () => {
    const groups = buildSchemaReviewGroups({
      schema: invoiceSchema(),
      extractedData: {
        invoiceNumber: 'INV-42',
        invoiceDate: '2026-03-01',
        supplier: 'Acme GmbH',
        totalGross: 11900,
        currency: 'EUR',
      },
      locale: 'de',
      plausibility: {
        overallStatus: 'WARNING',
        checks: [
          {
            code: 'INVOICE_DUPLICATE_NUMBER',
            status: 'WARNING',
            message: 'Rechnungsnummer bereits vorhanden',
            source: 'DOCUMENT',
            fieldPaths: ['invoiceNumber'],
          },
        ],
      },
    });

    const fields = flattenSchemaReviewGroups(groups);
    expect(groups.map((group) => group.id)).toEqual(['finance', 'event', 'parties']);
    expect(fields.find((field) => field.key === 'totalGross')?.value).toContain('119');
    expect(fields.find((field) => field.key === 'invoiceDate')?.value).toBe('01.03.2026');
    expect(fields.find((field) => field.key === 'invoiceNumber')?.fieldChecks).toHaveLength(1);
  });

  it('builds FINE review with sensitive masking and confidence only for low AI confidence', () => {
    const groups = buildSchemaReviewGroups({
      schema: fineSchema(),
      extractedData: {
        offenseDate: '2026-02-10',
        licensePlate: 'B-AB 1234',
        amountCents: 4500,
      },
      fieldProvenance: [
        {
          fieldKey: 'licensePlate',
          rawValue: 'B-AB 1234',
          normalizedValue: 'BAB1234',
          confidence: 0.62,
          page: 1,
          textEvidence: 'Kennzeichen B-AB 1234',
          sourceType: 'ai_extraction',
          manuallyEdited: false,
          confirmedValue: null,
          confirmedBy: null,
          confirmedAt: null,
        },
      ],
      locale: 'de',
    });

    const plate = flattenSchemaReviewGroups(groups).find((field) => field.key === 'licensePlate');
    expect(plate?.showConfidence).toBe(true);
    expect(plate?.confidencePercent).toBe(62);
    expect(maskSensitiveValue('B-AB 1234', true)).toContain('•');
    expect(flattenSchemaReviewGroups(groups).find((field) => field.key === 'amountCents')?.value).toContain('45');
  });

  it('builds SERVICE review and round-trips save payload with nested-free keys', () => {
    const groups = buildSchemaReviewGroups({
      schema: serviceSchema(),
      extractedData: {
        eventDate: '2026-01-15',
        odometerKm: 84500,
        workshopName: 'Werkstatt Nord',
        description: 'Inspektion',
        costCents: 25000,
      },
      locale: 'de',
    });

    const fields = flattenSchemaReviewGroups(groups);
    const saved = parseSchemaReviewFieldsForSave(fields, { locale: 'de' });
    expect(saved.eventDate).toBe('2026-01-15');
    expect(saved.odometerKm).toBe('84500');
    expect(saved.costCents).toBe(25000);
    expect(hasSavedFieldReview(saved)).toBe(true);
    expect(hasSavedFieldReview({ acceptedEntityLinks: [] })).toBe(false);
  });
});
