import {
  appendDocumentTypeAudit,
  buildContentCacheEntry,
  readContentCache,
  stripPipelineFromPlausibility,
} from './document-content-cache.util';

describe('document-content-cache.util', () => {
  const content = {
    text: 'cached text',
    pages: [{ pageNumber: 1, text: 'cached text', sourceMethod: 'OCR' as const, hasReliablePageBoundaries: true }],
    pageBoundaryReliable: true,
    sourceMethod: 'OCR' as const,
    pageCount: 1,
    ocrProvider: 'mistral',
    ocrModel: 'ocr-2505',
  };

  it('round-trips content cache keyed by objectKey', () => {
    const plausibility = {
      _pipeline: {
        contentCache: buildContentCacheEntry(content, 'obj-1'),
      },
    };
    const cache = readContentCache(plausibility, 'obj-1');
    expect(cache?.text).toBe('cached text');
    expect(readContentCache(plausibility, 'other-key')).toBeNull();
  });

  it('strips internal pipeline data from public plausibility', () => {
    const stripped = stripPipelineFromPlausibility({
      overallStatus: 'OK',
      _pipeline: { contentCache: buildContentCacheEntry(content, 'obj-1') },
    }) as Record<string, unknown>;
    expect(stripped.overallStatus).toBe('OK');
    expect(stripped._pipeline).toBeUndefined();
  });

  it('appends document type audit entries', () => {
    const merged = appendDocumentTypeAudit(null, {
      from: null,
      to: 'INVOICE',
      at: '2026-07-10T12:00:00.000Z',
      reason: 'user_selected_document_type',
    });
    expect((merged._pipeline as any).documentTypeAudit).toHaveLength(1);
  });
});
