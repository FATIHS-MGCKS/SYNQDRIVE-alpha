import { describe, expect, it } from 'vitest';
import {
  buildDocumentIntakeSearch,
  parseDocumentIntakeTab,
  readDocumentIntakeExtractionId,
  readDocumentIntakeTab,
} from './document-intake-navigation';

describe('document-intake-navigation', () => {
  it('parses and builds document tab search params', () => {
    expect(parseDocumentIntakeTab('review')).toBe('review');
    expect(parseDocumentIntakeTab('invalid')).toBe('upload');
    expect(readDocumentIntakeTab('?documentTab=archive')).toBe('archive');
    expect(readDocumentIntakeExtractionId('?documentTab=review&extractionId=ext-1')).toBe('ext-1');
    expect(
      buildDocumentIntakeSearch({ tab: 'review', extractionId: 'ext-2', archiveQ: 'invoice' }),
    ).toBe('?documentTab=review&extractionId=ext-2&archiveQ=invoice');
  });
});
