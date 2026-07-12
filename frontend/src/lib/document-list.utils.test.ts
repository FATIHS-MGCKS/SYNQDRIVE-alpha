import { describe, expect, it } from 'vitest';
import { dedupeDocumentsByType } from './document-list.utils';

describe('dedupeDocumentsByType', () => {
  it('keeps newest per documentType', () => {
    const out = dedupeDocumentsByType([
      { id: 'a1', documentType: 'AGB', status: 'GENERATED', createdAt: '2026-01-01T10:00:00Z' },
      { id: 'a2', documentType: 'AGB', status: 'GENERATED', createdAt: '2026-01-02T10:00:00Z' },
      { id: 'b1', documentType: 'INVOICE', status: 'GENERATED', createdAt: '2026-01-01T10:00:00Z' },
    ]);
    expect(out.map((d) => d.id).sort()).toEqual(['a2', 'b1']);
  });

  it('skips VOID', () => {
    const out = dedupeDocumentsByType([
      { id: 'a1', documentType: 'AGB', status: 'VOID', createdAt: '2026-01-02T10:00:00Z' },
      { id: 'a2', documentType: 'AGB', status: 'GENERATED', createdAt: '2026-01-01T10:00:00Z' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('a2');
  });
});
