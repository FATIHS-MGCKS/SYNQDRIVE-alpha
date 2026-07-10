import { DocumentTextExtractorService } from './document-text-extractor.service';

describe('DocumentTextExtractorService', () => {
  const svc = new DocumentTextExtractorService();

  it('reads plain text as UTF-8', () => {
    const text = svc.extractPlainText(Buffer.from('Rechnung Nr. 42\nKm-Stand: 50000', 'utf8'));
    expect(text).toContain('Km-Stand: 50000');
  });

  it('returns null for unreadable PDF buffers instead of throwing', async () => {
    await expect(
      svc.tryExtractPdfText(Buffer.from('%PDF-1.4 not really a pdf')),
    ).resolves.toBeNull();
  });
});
