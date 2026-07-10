import { DocumentChunkingService } from './document-chunking.service';
import { DocumentPageBlock } from '@modules/document-extraction/document-page.types';

describe('DocumentChunkingService', () => {
  const svc = new DocumentChunkingService();
  const limits = {
    targetChars: 500,
    maxChars: 800,
    maxPages: 200,
    maxChunks: 12,
    overlapChars: 0,
  };

  function pages(blocks: Array<{ pageNumber: number | null; text: string }>): DocumentPageBlock[] {
    return blocks.map((b) => ({
      pageNumber: b.pageNumber,
      text: b.text,
      sourceMethod: 'TEXT_LAYER',
      hasReliablePageBoundaries: b.pageNumber != null,
    }));
  }

  it('keeps a single-page document in one chunk', () => {
    const result = svc.chunk({
      pages: pages([{ pageNumber: 1, text: 'Invoice 123 odometer 50000' }]),
      limits,
    });
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].text).toContain('50000');
    expect(result.limitExceeded).toBe(false);
  });

  it('packs multiple small pages efficiently', () => {
    const result = svc.chunk({
      pages: pages(
        Array.from({ length: 5 }, (_, i) => ({
          pageNumber: i + 1,
          text: `Page ${i + 1} content line`,
        })),
      ),
      limits,
    });
    expect(result.chunks.length).toBeLessThanOrEqual(2);
    expect(result.chunks[0].pageNumbers.length).toBeGreaterThan(1);
  });

  it('processes info on the last page', () => {
    const result = svc.chunk({
      pages: pages([
        { pageNumber: 1, text: 'Header only' },
        { pageNumber: 2, text: 'Middle filler text' },
        { pageNumber: 20, text: 'FINAL odometer reading 98765 km' },
      ]),
      limits: { ...limits, targetChars: 200, maxChars: 400 },
    });
    const allText = result.chunks.map((c) => c.text).join('\n');
    expect(allText).toContain('98765');
  });

  it('does not split markdown table rows across chunk boundaries when packing', () => {
    const table = '| Pos | mm |\n| --- | --- |\n| FL | 5.2 |\n| FR | 5.1 |';
    const result = svc.chunk({
      pages: pages([{ pageNumber: 1, text: table }]),
      limits: { ...limits, targetChars: 100, maxChars: 200 },
    });
    expect(result.chunks[0].text).toContain('| FL | 5.2 |');
  });

  it('reports MAX_PAGES when page count exceeds limit', () => {
    const result = svc.chunk({
      pages: pages(
        Array.from({ length: 25 }, (_, i) => ({
          pageNumber: i + 1,
          text: `page ${i + 1}`,
        })),
      ),
      limits: { ...limits, maxPages: 20 },
    });
    expect(result.limitExceeded).toBe(true);
    expect(result.limitCode).toBe('MAX_PAGES');
    expect(result.chunks).toHaveLength(0);
  });

  it('reports uncovered pages when MAX_CHUNKS is exceeded', () => {
    const longBody = 'x'.repeat(700);
    const result = svc.chunk({
      pages: pages(
        Array.from({ length: 15 }, (_, i) => ({
          pageNumber: i + 1,
          text: `Page ${i + 1}\n${longBody}`,
        })),
      ),
      limits: { ...limits, targetChars: 300, maxChars: 700, maxChunks: 3 },
    });
    expect(result.limitExceeded).toBe(true);
    expect(result.limitCode).toBe('MAX_CHUNKS');
    expect(result.chunks.length).toBeLessThanOrEqual(3);
    expect(result.uncoveredPageNumbers.length).toBeGreaterThan(0);
  });

  it('uses logical TXT blocks without inventing page numbers', () => {
    const result = svc.chunk({
      pages: [
        {
          pageNumber: null,
          text: 'Section A',
          sourceMethod: 'TXT_DIRECT',
          hasReliablePageBoundaries: false,
        },
        {
          pageNumber: null,
          text: 'Section B with VIN',
          sourceMethod: 'TXT_DIRECT',
          hasReliablePageBoundaries: false,
        },
      ],
      limits,
    });
    expect(result.chunks[0].pageNumbers).toEqual([]);
    expect(result.chunks.map((c) => c.text).join(' ')).toContain('Section B');
  });
});
