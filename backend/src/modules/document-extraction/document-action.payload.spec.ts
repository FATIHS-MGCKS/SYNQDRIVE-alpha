import { sanitizeDocumentActionPayload } from './document-action.payload';

describe('sanitizeDocumentActionPayload', () => {
  it('drops OCR text fields and secret-like keys', () => {
    const sanitized = sanitizeDocumentActionPayload({
      invoiceNumber: 'INV-1',
      rawText: 'full ocr dump that must never be stored',
      ocrText: 'another dump',
      api_key: 'secret',
      nested: {
        pageText: 'page dump',
        amountGross: 119,
      },
    });

    expect(sanitized).toEqual({
      invoiceNumber: 'INV-1',
      nested: {
        amountGross: 119,
      },
    });
  });

  it('truncates very long string values', () => {
    const long = 'x'.repeat(700);
    const sanitized = sanitizeDocumentActionPayload({ note: long });
    expect((sanitized.note as string).length).toBeLessThanOrEqual(513);
    expect(sanitized.note).toMatch(/…$/);
  });
});
