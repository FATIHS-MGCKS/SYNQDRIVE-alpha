import { DOCUMENT_STATUS } from './documents.constants';
import { dedupeDocumentsByType } from './document-list-dedupe.util';

describe('dedupeDocumentsByType', () => {
  it('keeps newest per documentType', () => {
    const out = dedupeDocumentsByType([
      {
        id: 'a1',
        documentType: 'TERMS_AND_CONDITIONS',
        status: DOCUMENT_STATUS.GENERATED,
        createdAt: new Date('2026-01-01T10:00:00Z'),
      },
      {
        id: 'a2',
        documentType: 'TERMS_AND_CONDITIONS',
        status: DOCUMENT_STATUS.GENERATED,
        createdAt: new Date('2026-01-02T10:00:00Z'),
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('a2');
  });
});
