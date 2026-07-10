import {
  buildDocumentExtractionWhere,
  parseDocumentExtractionPagination,
} from './document-extraction-query.util';

describe('document-extraction-query.util', () => {
  it('caps pagination limit at 50', () => {
    const parsed = parseDocumentExtractionPagination({ page: 2, limit: 200 });
    expect(parsed.limit).toBe(50);
    expect(parsed.skip).toBe(50);
  });

  it('builds org-scoped where with filters', () => {
    const where = buildDocumentExtractionWhere({
      organizationId: 'org-1',
      vehicleId: 'v1',
      status: 'READY_FOR_REVIEW',
      documentType: 'INVOICE',
      createdBy: 'user-1',
      createdFrom: '2026-07-01T00:00:00.000Z',
      createdTo: '2026-07-10T00:00:00.000Z',
    });

    expect(where.organizationId).toBe('org-1');
    expect(where.vehicleId).toBe('v1');
    expect(where.status).toBe('READY_FOR_REVIEW');
    expect(where.createdById).toBe('user-1');
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { effectiveDocumentType: 'INVOICE' },
        { requestedDocumentType: 'INVOICE' },
        { detectedDocumentType: 'INVOICE' },
      ]),
    );
    expect(where.createdAt).toEqual({
      gte: new Date('2026-07-01T00:00:00.000Z'),
      lte: new Date('2026-07-10T00:00:00.000Z'),
    });
  });
});
