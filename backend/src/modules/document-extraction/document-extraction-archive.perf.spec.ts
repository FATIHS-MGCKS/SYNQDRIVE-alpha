import {
  buildArchiveSearchText,
  buildDocumentExtractionArchiveIndexRow,
} from './document-extraction-archive-index.materializer';
import { buildDocumentExtractionArchiveWhere } from './document-extraction-archive-query.util';

describe('document-extraction-archive.perf', () => {
  const MATERIALIZE_ITERATIONS = 500;
  const WHERE_ITERATIONS = 2000;
  const MATERIALIZE_BUDGET_MS = 250;
  const WHERE_BUDGET_MS = 120;

  it(`materializes ${MATERIALIZE_ITERATIONS} archive rows within ${MATERIALIZE_BUDGET_MS}ms`, () => {
    const baseRecord = {
      id: 'ext-perf',
      organizationId: 'org-perf',
      vehicleId: 'veh-perf',
      status: 'READY_FOR_REVIEW' as const,
      effectiveDocumentType: 'INVOICE' as const,
      sourceFileName: 'invoice.pdf',
      createdAt: new Date('2026-07-17T10:00:00.000Z'),
      confirmedData: {
        invoiceNumber: 'INV-PERF',
        notes: 'Performance fixture',
        acceptedEntityLinks: [{ entityType: 'vendor', entityId: 'vendor-perf', label: 'Vendor' }],
      },
      extractedData: {
        rawText: 'must stay out of search text',
        supplierName: 'Workshop Perf',
      },
      plausibility: {
        _pipeline: {
          followUpSuggestions: [],
        },
      },
    };

    const started = performance.now();
    for (let i = 0; i < MATERIALIZE_ITERATIONS; i += 1) {
      const row = buildDocumentExtractionArchiveIndexRow({
        ...baseRecord,
        id: `ext-perf-${i}`,
        confirmedData: {
          ...baseRecord.confirmedData,
          invoiceNumber: `INV-PERF-${i}`,
        },
      });
      expect(row?.searchText).not.toContain('must stay out');
      expect(buildArchiveSearchText({
        sourceFileName: row?.sourceFileName,
        documentCategory: row?.documentCategory,
        documentSubtype: row?.documentSubtype,
        fields: baseRecord.confirmedData as Record<string, unknown>,
        entityLinks: {
          vehicleId: row?.vehicleId ?? null,
          bookingId: row?.bookingId ?? null,
          customerId: row?.customerId ?? null,
          driverId: row?.driverId ?? null,
          vendorId: row?.vendorId ?? null,
        },
      })).not.toContain('rawtext');
    }
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(MATERIALIZE_BUDGET_MS);
  });

  it(`builds archive where clauses ${WHERE_ITERATIONS} times within ${WHERE_BUDGET_MS}ms`, () => {
    const started = performance.now();
    for (let i = 0; i < WHERE_ITERATIONS; i += 1) {
      const where = buildDocumentExtractionArchiveWhere({
        organizationId: 'org-perf',
        status: 'READY_FOR_REVIEW',
        documentCategory: 'FINANCE',
        documentSubtype: 'INVOICE',
        vehicleId: 'veh-perf',
        bookingId: 'book-perf',
        customerId: 'cust-perf',
        driverId: 'driver-perf',
        vendorId: 'vendor-perf',
        uploadedBy: 'user-perf',
        uploadedFrom: '2026-07-01T00:00:00.000Z',
        uploadedTo: '2026-07-17T00:00:00.000Z',
        fileName: `invoice-${i}`,
        invoiceNumber: `INV-${i}`,
        caseReference: `AZ-${i}`,
        actionStatus: 'READY',
        followUpStatus: 'OPEN',
        q: `query-${i}`,
      });
      expect(where.organizationId).toBe('org-perf');
    }
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(WHERE_BUDGET_MS);
  });
});
