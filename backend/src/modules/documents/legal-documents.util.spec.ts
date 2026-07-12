import { isLegalPdfUpload, normalizeLegalPdfMimeType } from './legal-documents.util';

describe('legal-documents.util', () => {
  it('accepts PDF by mime type', () => {
    expect(isLegalPdfUpload({ mimetype: 'application/pdf', originalname: 'doc.bin' })).toBe(true);
  });

  it('accepts PDF by .pdf extension when mobile omits mime type', () => {
    expect(isLegalPdfUpload({ mimetype: '', originalname: 'datenschutz.pdf' })).toBe(true);
    expect(isLegalPdfUpload({ mimetype: 'application/octet-stream', originalname: 'privacy.pdf' })).toBe(
      true,
    );
  });

  it('rejects non-pdf files', () => {
    expect(isLegalPdfUpload({ mimetype: 'image/png', originalname: 'scan.png' })).toBe(false);
  });

  it('normalizes legal pdf mime type from extension', () => {
    expect(normalizeLegalPdfMimeType('', 'privacy.pdf')).toBe('application/pdf');
  });
});
