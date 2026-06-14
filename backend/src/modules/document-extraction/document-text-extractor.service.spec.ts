import { DocumentTextExtractorService } from './document-text-extractor.service';
import { OcrNotConfiguredError, UnsupportedFileTypeError } from './document-extraction.errors';

describe('DocumentTextExtractorService', () => {
  const svc = new DocumentTextExtractorService();

  it('reads plain text as UTF-8', async () => {
    const result = await svc.extractText({
      buffer: Buffer.from('Rechnung Nr. 42\nKm-Stand: 50000', 'utf8'),
      mimeType: 'text/plain',
    });
    expect(result.method).toBe('text');
    expect(result.text).toContain('Km-Stand: 50000');
  });

  it('fails honestly for images instead of faking OCR output', async () => {
    await expect(
      svc.extractText({ buffer: Buffer.from([0xff, 0xd8, 0xff]), mimeType: 'image/jpeg' }),
    ).rejects.toBeInstanceOf(OcrNotConfiguredError);
    await expect(
      svc.extractText({ buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mimeType: 'image/png' }),
    ).rejects.toBeInstanceOf(OcrNotConfiguredError);
  });

  it('throws UnsupportedFileTypeError for an unknown mime type', async () => {
    await expect(
      svc.extractText({ buffer: Buffer.from('x'), mimeType: 'application/zip' }),
    ).rejects.toBeInstanceOf(UnsupportedFileTypeError);
  });

  it('maps an unreadable/non-text PDF to OcrNotConfiguredError', async () => {
    // Not a valid PDF — pdf-parse should fail to extract text, which the service
    // surfaces as a user-safe "scanned/image-based" error (no fake data).
    await expect(
      svc.extractText({ buffer: Buffer.from('%PDF-1.4 not really a pdf'), mimeType: 'application/pdf' }),
    ).rejects.toBeInstanceOf(OcrNotConfiguredError);
  });
});
