import {
  buildDocumentExtractionResponseSchema,
  buildEmptyFieldShape,
  mapExtractedFields,
} from './document-ai-extraction.schema.util';

const SERVICE_FIELDS = [
  { key: 'eventDate', label: 'Date', type: 'date' },
  { key: 'odometerKm', label: 'Odometer', type: 'number' },
  { key: 'workshopName', label: 'Workshop', type: 'string' },
];

describe('document-ai-extraction.schema.util', () => {
  it('builds nested empty field shape', () => {
    expect(
      buildEmptyFieldShape([
        { key: 'treadDepthMm.fl', label: 'FL', type: 'number' },
        { key: 'treadDepthMm.fr', label: 'FR', type: 'number' },
      ]),
    ).toEqual({
      treadDepthMm: { fl: null, fr: null },
    });
  });

  it('maps extracted fields and drops unknown keys', () => {
    const mapped = mapExtractedFields(
      {
        eventDate: '2026-01-10',
        odometerKm: 50000,
        injectedKey: 'drop me',
        treadDepthMm: { fl: 5.2, fr: '' },
      },
      [
        { key: 'eventDate', label: 'Date', type: 'date' },
        { key: 'odometerKm', label: 'Odometer', type: 'number' },
        { key: 'treadDepthMm.fl', label: 'FL', type: 'number' },
        { key: 'treadDepthMm.fr', label: 'FR', type: 'number' },
      ],
    );

    expect(mapped).toEqual({
      eventDate: '2026-01-10',
      odometerKm: 50000,
      treadDepthMm: { fl: 5.2, fr: null },
    });
    expect(mapped).not.toHaveProperty('injectedKey');
  });

  it('builds a strict response schema with fields object', () => {
    const schema = buildDocumentExtractionResponseSchema(SERVICE_FIELDS);
    expect(schema).toMatchObject({
      type: 'object',
      required: ['documentType', 'fields', 'recommendedHumanReviewNotes'],
      properties: {
        fields: {
          type: 'object',
          additionalProperties: false,
        },
      },
    });
  });
});
