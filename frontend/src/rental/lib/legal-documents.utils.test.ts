import { describe, expect, it } from 'vitest';
import { isLegalPdfFile } from './legal-documents.utils';

describe('isLegalPdfFile', () => {
  it('accepts pdf mime type', () => {
    const file = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' });
    expect(isLegalPdfFile(file)).toBe(true);
  });

  it('accepts .pdf extension when type is empty (mobile)', () => {
    const file = new File(['%PDF'], 'datenschutz.pdf', { type: '' });
    expect(isLegalPdfFile(file)).toBe(true);
  });

  it('rejects non-pdf', () => {
    const file = new File(['x'], 'scan.png', { type: 'image/png' });
    expect(isLegalPdfFile(file)).toBe(false);
  });
});
