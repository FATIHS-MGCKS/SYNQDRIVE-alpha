import { extractionMatchesBusinessHints, normalizeBusinessIdentifier } from './document-upload-duplicate.util';

describe('document-upload-duplicate.util', () => {
  it('normalizes business identifiers for org-scoped comparison', () => {
    expect(normalizeBusinessIdentifier(' inv 2026 42 ')).toBe('INV202642');
  });

  it('matches invoice numbers from confirmed or extracted data', () => {
    const match = extractionMatchesBusinessHints(
      { confirmedData: { invoiceNumber: 'INV-2026-42' } },
      { invoiceNumber: 'inv-2026-42' },
    );
    expect(match).toEqual({ kind: 'invoice', value: 'INV-2026-42' });
  });

  it('matches reference numbers from archive/fine fields', () => {
    const match = extractionMatchesBusinessHints(
      { extractedData: { reportNumber: 'AZ-2026-4412' } },
      { referenceNumber: 'az-2026-4412' },
    );
    expect(match).toEqual({ kind: 'reference', value: 'AZ-2026-4412' });
  });
});
