import {
  buildDataUrl,
  buildOcrDocument,
  buildPageMarkedMarkdown,
  normalizeOcrResponse,
} from './mistral-ocr.mapper';

describe('mistral-ocr.mapper', () => {
  it('builds a PDF document_url data URL without logging raw base64 elsewhere', () => {
    const buffer = Buffer.from('%PDF-1.4');
    const doc = buildOcrDocument({
      buffer,
      mimeType: 'application/pdf',
      originalName: 'report.pdf',
    });
    expect(doc).toEqual({
      type: 'document_url',
      documentUrl: buildDataUrl(buffer, 'application/pdf'),
      documentName: 'report.pdf',
    });
    expect((doc as { documentUrl: string }).documentUrl.startsWith('data:application/pdf;base64,')).toBe(
      true,
    );
  });

  it('builds an image_url data URL for JPEG uploads', () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff]);
    const doc = buildOcrDocument({ buffer, mimeType: 'image/jpeg' });
    expect(doc).toEqual({
      type: 'image_url',
      imageUrl: buildDataUrl(buffer, 'image/jpeg'),
    });
    expect((doc as { imageUrl: string }).imageUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('normalizes pages in index order and preserves page markers', () => {
    const output = normalizeOcrResponse({
      response: {
        model: 'mistral-ocr-latest',
        pages: [
          {
            index: 1,
            markdown: 'Second page',
            images: [],
            dimensions: null,
            header: 'Header 2',
            footer: 'Footer 2',
            tables: [{ id: 't1', content: '|a|', format: 'markdown' }],
          },
          {
            index: 0,
            markdown: 'First page',
            images: [],
            dimensions: null,
            header: 'Header 1',
            footer: null,
          },
        ],
        usageInfo: { pagesProcessed: 2, docSizeBytes: 1024 },
      },
      provider: 'mistral',
      modelFallback: 'mistral-ocr-latest',
      processingDurationMs: 42,
    });

    expect(output.pageCount).toBe(2);
    expect(output.pages.map((p) => p.pageNumber)).toEqual([1, 2]);
    expect(output.pages[0].markdown).toBe('First page');
    expect(output.pages[1].tables?.[0].id).toBe('t1');
    expect(output.normalizedMarkdown).toBe(
      buildPageMarkedMarkdown([
        {
          pageIndex: 0,
          pageNumber: 1,
          markdown: 'First page',
          header: 'Header 1',
          footer: null,
        },
        {
          pageIndex: 1,
          pageNumber: 2,
          markdown: 'Second page',
          header: 'Header 2',
          footer: 'Footer 2',
          tables: [{ id: 't1', format: 'markdown', content: '|a|' }],
        },
      ]),
    );
    expect(output.fullText).toContain('--- PAGE 1 ---');
    expect(output.fullText).toContain('--- PAGE 2 ---');
    expect(output.usage?.pagesProcessed).toBe(2);
  });
});
