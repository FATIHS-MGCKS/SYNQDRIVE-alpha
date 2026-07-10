import { buildClassificationDocumentText } from './document-classification-text.util';

describe('buildClassificationDocumentText', () => {
  it('returns full text when under max chars', () => {
    const sample = buildClassificationDocumentText({
      fullText: 'fallback',
      pages: [
        { pageNumber: 1, charCount: 5, text: 'hello' },
        { pageNumber: 2, charCount: 5, text: 'world' },
      ],
      maxChars: 100,
    });
    expect(sample.truncated).toBe(false);
    expect(sample.documentText).toContain('PAGE 1');
    expect(sample.documentText).toContain('PAGE 2');
    expect(sample.sampledPageNumbers).toEqual([1, 2]);
  });

  it('includes first and last pages when document exceeds max chars', () => {
    const sample = buildClassificationDocumentText({
      fullText: 'x'.repeat(50_000),
      pages: [
        { pageNumber: 1, charCount: 10_000, text: 'A'.repeat(10_000) },
        { pageNumber: 2, charCount: 10_000, text: 'B'.repeat(10_000) },
        { pageNumber: 3, charCount: 10_000, text: 'C'.repeat(10_000) },
        { pageNumber: 4, charCount: 10_000, text: 'LAST-PAGE-MARKER-' + 'D'.repeat(9_980) },
      ],
      maxChars: 24_000,
    });

    expect(sample.truncated).toBe(true);
    expect(sample.documentText).toContain('PAGE 1');
    expect(sample.documentText).toContain('LAST-PAGE-MARKER');
    expect(sample.sampledPageNumbers).toContain(1);
    expect(sample.sampledPageNumbers).toContain(4);
    expect(sample.omittedPageNumbers.length).toBeGreaterThan(0);
    expect(sample.documentText.length).toBeLessThanOrEqual(24_000);
  });

  it('falls back to head slice when no page texts are available', () => {
    const sample = buildClassificationDocumentText({
      fullText: 'Z'.repeat(30_000),
      pages: [{ pageNumber: 1, charCount: 30_000 }],
      maxChars: 1_000,
    });
    expect(sample.truncated).toBe(true);
    expect(sample.documentText).toHaveLength(1_000);
    expect(sample.documentText.startsWith('Z')).toBe(true);
  });
});
