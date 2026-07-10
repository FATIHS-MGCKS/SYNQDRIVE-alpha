import {
  bucketFileSizeBytes,
  formatDocumentExtractionLog,
  mimeCategoryFromMime,
} from './document-extraction-log.util';

describe('document-extraction-log.util', () => {
  it('buckets file sizes without exposing exact bytes', () => {
    expect(bucketFileSizeBytes(0)).toBe('unknown');
    expect(bucketFileSizeBytes(100_000)).toBe('le_256kb');
    expect(bucketFileSizeBytes(2 * 1024 * 1024)).toBe('le_5mb');
    expect(bucketFileSizeBytes(30 * 1024 * 1024)).toBe('gt_25mb');
  });

  it('maps mime types to low-cardinality categories', () => {
    expect(mimeCategoryFromMime('application/pdf')).toBe('pdf');
    expect(mimeCategoryFromMime('image/jpeg; charset=binary')).toBe('image_jpeg');
    expect(mimeCategoryFromMime('application/octet-stream')).toBe('other');
  });

  it('formats structured logs without document content or filenames', () => {
    const line = formatDocumentExtractionLog({
      extractionId: 'ext-1',
      stage: 'OCR',
      status: 'completed',
      mimeCategory: 'pdf',
      fileSizeBucket: 'le_1mb',
      pageCount: 3,
      provider: 'mistral',
      model: 'mistral-ocr-latest',
      durationMs: 1200,
    });
    const parsed = JSON.parse(line);
    expect(parsed.component).toBe('document_extraction');
    expect(parsed.extractionId).toBe('ext-1');
    expect(parsed.stage).toBe('OCR');
    expect(parsed.status).toBe('completed');
    expect(parsed).not.toHaveProperty('documentText');
    expect(parsed).not.toHaveProperty('fileName');
    expect(parsed).not.toHaveProperty('vin');
    expect(JSON.stringify(parsed)).not.toContain('base64');
  });
});
