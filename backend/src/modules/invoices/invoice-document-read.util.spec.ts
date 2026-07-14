import { DOCUMENT_STATUS, DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import {
  DOC_BOOKING_INVOICE,
  INVOICE_BOOKING,
  ORG_A,
} from './__fixtures__/invoice-baseline.fixtures';
import {
  filterIntegrityValidDocuments,
  mapDocumentLifecycle,
  resolveCanonicalActiveDocumentId,
  sortInvoiceDocuments,
} from './invoice-document-read.util';

describe('invoice-document-read.util', () => {
  const baseDoc = {
    id: DOC_BOOKING_INVOICE,
    organizationId: ORG_A,
    documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
    status: DOCUMENT_STATUS.GENERATED,
    fileName: 'invoice.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1200,
    objectKey: 'organizations/org/doc.pdf',
    invoiceId: INVOICE_BOOKING,
    versionNumber: 1 as number | null,
    isActiveVersion: false,
    generationStatus: null as string | null,
    generationErrorCode: null as string | null,
    lastErrorMessage: null as string | null,
    nextRetryAt: null as Date | null,
    generatedByUserId: 'user-1',
    createdAt: new Date('2026-07-10T10:00:00.000Z'),
  };

  it('sorts by version then createdAt', () => {
    const sorted = sortInvoiceDocuments([
      { ...baseDoc, id: 'b', versionNumber: 2, createdAt: new Date('2026-07-11') },
      { ...baseDoc, id: 'a', versionNumber: 1, createdAt: new Date('2026-07-10') },
    ]);
    expect(sorted.map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('resolves single linked document as active (canonical query)', () => {
    const { activeDocumentId, cacheMismatch } = resolveCanonicalActiveDocumentId(
      [baseDoc],
      DOCUMENT_TYPE.BOOKING_INVOICE,
      null,
      INVOICE_BOOKING,
    );
    expect(activeDocumentId).toBe(DOC_BOOKING_INVOICE);
    expect(cacheMismatch).toBe(false);
  });

  it('uses legacy cache fallback when invoiceId link missing on cached doc', () => {
    const cachedOnly = { ...baseDoc, invoiceId: null };
    const { activeDocumentId } = resolveCanonicalActiveDocumentId(
      [cachedOnly],
      DOCUMENT_TYPE.BOOKING_INVOICE,
      DOC_BOOKING_INVOICE,
      INVOICE_BOOKING,
    );
    expect(activeDocumentId).toBe(DOC_BOOKING_INVOICE);
  });

  it('detects cache mismatch when pointer differs from canonical active', () => {
    const older = {
      ...baseDoc,
      id: 'old-doc',
      versionNumber: 1,
      createdAt: new Date('2026-07-09'),
    };
    const newer = {
      ...baseDoc,
      id: 'new-doc',
      versionNumber: 2,
      createdAt: new Date('2026-07-12'),
    };
    const { activeDocumentId, cacheMismatch } = resolveCanonicalActiveDocumentId(
      [older, newer],
      DOCUMENT_TYPE.BOOKING_INVOICE,
      'old-doc',
      INVOICE_BOOKING,
    );
    expect(activeDocumentId).toBe('new-doc');
    expect(cacheMismatch).toBe(true);
  });

  it('filters foreign organization documents', () => {
    const filtered = filterIntegrityValidDocuments(
      [{ ...baseDoc, organizationId: 'other-org' }, baseDoc],
      ORG_A,
      INVOICE_BOOKING,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].organizationId).toBe(ORG_A);
  });

  it('maps lifecycle for failed and voided documents', () => {
    expect(mapDocumentLifecycle({ ...baseDoc, status: DOCUMENT_STATUS.FAILED }, false)).toBe(
      'FAILED',
    );
    expect(mapDocumentLifecycle({ ...baseDoc, status: DOCUMENT_STATUS.VOID }, false)).toBe(
      'VOIDED',
    );
    expect(mapDocumentLifecycle(baseDoc, true)).toBe('ACTIVE');
  });
});
