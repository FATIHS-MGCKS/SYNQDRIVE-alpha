import { OrgInvoiceStatus, OrgInvoiceType } from '@prisma/client';
import { DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import { deriveDocumentGenerationStatus, buildInvoiceDetailCapabilities } from './invoice-detail-actions.util';
import type { InvoiceDocumentsViewDto } from './invoice-document-read.types';

const emptyDocs: InvoiceDocumentsViewDto = {
  activeDocumentId: null,
  cacheMismatch: false,
  documents: [],
};

describe('invoice-detail-actions.util', () => {
  it('deriveDocumentGenerationStatus returns NOT_STARTED without documents', () => {
    expect(deriveDocumentGenerationStatus(emptyDocs)).toBe('NOT_STARTED');
  });

  it('deriveDocumentGenerationStatus returns SUCCEEDED with active document', () => {
    expect(
      deriveDocumentGenerationStatus({
        activeDocumentId: 'doc-1',
        cacheMismatch: false,
        documents: [
          {
            id: 'doc-1',
            documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
            filename: 'a.pdf',
            version: 1,
            status: 'GENERATED',
            generationStatus: 'SUCCEEDED',
            lifecycle: 'ACTIVE',
            isActive: true,
            createdAt: '2026-07-10T10:00:00.000Z',
            createdBy: null,
            mimeType: 'application/pdf',
            sizeBytes: 100,
            downloadAvailable: true,
            previewAvailable: true,
            downloadPath: '/x',
            lastError: null,
            retryable: false,
          },
        ],
      }),
    ).toBe('SUCCEEDED');
  });

  it('buildInvoiceDetailCapabilities blocks issue for non-draft', () => {
    const caps = buildInvoiceDetailCapabilities({
      type: OrgInvoiceType.OUTGOING_BOOKING,
      status: OrgInvoiceStatus.ISSUED,
      totalCents: 10000,
      paidCents: 0,
      outstandingCents: 10000,
      sequenceNumber: 1,
      bookingId: 'bk-1',
      customerEmail: 'a@b.de',
      documentsView: {
        activeDocumentId: 'doc-1',
        cacheMismatch: false,
        documents: [],
      },
    });
    expect(caps.canIssue).toBe(false);
    expect(caps.blockingReasons.issue.length).toBeGreaterThan(0);
  });
});
