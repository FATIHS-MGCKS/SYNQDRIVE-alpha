import {
  buildDocumentExtractionArchiveWhere,
  parseDocumentExtractionArchivePagination,
} from './document-extraction-archive-query.util';

describe('document-extraction-archive-query.util', () => {
  it('caps pagination limit at 50', () => {
    const parsed = parseDocumentExtractionArchivePagination({ page: 3, limit: 200 });
    expect(parsed.limit).toBe(50);
    expect(parsed.skip).toBe(100);
    expect(parsed.page).toBe(3);
  });

  it('builds tenant-scoped where with archive filters', () => {
    const where = buildDocumentExtractionArchiveWhere({
      organizationId: 'org-1',
      status: 'READY_FOR_REVIEW',
      documentCategory: 'FINANCE',
      documentSubtype: 'INVOICE',
      vehicleId: 'veh-1',
      bookingId: 'book-1',
      customerId: 'cust-1',
      driverId: 'driver-1',
      vendorId: 'vendor-1',
      uploadedBy: 'user-1',
      uploadedFrom: '2026-07-01T00:00:00.000Z',
      uploadedTo: '2026-07-10T00:00:00.000Z',
      fileName: 'invoice',
      invoiceNumber: 'RE-1',
      caseReference: 'AZ-9',
      actionStatus: 'READY',
      followUpStatus: 'OPEN',
      q: 'hamburg',
    });

    expect(where.organizationId).toBe('org-1');
    expect(where.status).toBe('READY_FOR_REVIEW');
    expect(where.documentCategory).toBe('FINANCE');
    expect(where.documentSubtype).toBe('INVOICE');
    expect(where.vehicleId).toBe('veh-1');
    expect(where.bookingId).toBe('book-1');
    expect(where.customerId).toBe('cust-1');
    expect(where.driverId).toBe('driver-1');
    expect(where.vendorId).toBe('vendor-1');
    expect(where.createdById).toBe('user-1');
    expect(where.actionStatus).toBe('READY');
    expect(where.followUpStatus).toBe('OPEN');
    expect(where.uploadedAt).toEqual({
      gte: new Date('2026-07-01T00:00:00.000Z'),
      lte: new Date('2026-07-10T00:00:00.000Z'),
    });
    expect(where.sourceFileName).toEqual({ contains: 'invoice', mode: 'insensitive' });
    expect(where.invoiceNumber).toEqual({ contains: 'RE-1', mode: 'insensitive' });
    expect(where.caseReference).toEqual({ contains: 'AZ-9', mode: 'insensitive' });
    expect(where.searchText).toEqual({ contains: 'hamburg', mode: 'insensitive' });
  });
});
