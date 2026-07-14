import { OrgInvoiceStatus, OrgInvoiceType } from '@prisma/client';
import { DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import { validateInvoiceEmailSend } from './invoice-send-email.util';

const baseDocs = {
  activeDocumentId: 'doc-1',
  cacheMismatch: false,
  documents: [
    {
      id: 'doc-1',
      documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
      filename: 'invoice.pdf',
      version: 1,
      status: 'GENERATED',
      generationStatus: 'SUCCEEDED',
      lifecycle: 'ACTIVE' as const,
      isActive: true,
      createdAt: '2026-07-10T10:00:00.000Z',
      createdBy: null,
      mimeType: 'application/pdf',
      sizeBytes: 1000,
      downloadAvailable: true,
      previewAvailable: true,
      downloadPath: '/organizations/org/invoices/doc-1/download',
      lastError: null,
      retryable: false,
    },
  ],
};

describe('invoice-send-email.util', () => {
  it('blocks incoming invoices', () => {
    const result = validateInvoiceEmailSend({
      type: OrgInvoiceType.INCOMING_VENDOR,
      status: OrgInvoiceStatus.APPROVED,
      sequenceNumber: null,
      customerEmail: null,
      documentsView: baseDocs,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INCOMING_NOT_SENDABLE');
  });

  it('blocks draft outgoing invoices', () => {
    const result = validateInvoiceEmailSend({
      type: OrgInvoiceType.OUTGOING_BOOKING,
      status: OrgInvoiceStatus.DRAFT,
      sequenceNumber: null,
      customerEmail: 'a@b.de',
      documentsView: baseDocs,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_STATUS');
  });

  it('requires recipient when customer email missing', () => {
    const result = validateInvoiceEmailSend({
      type: OrgInvoiceType.OUTGOING_MANUAL,
      status: OrgInvoiceStatus.ISSUED,
      sequenceNumber: 1,
      customerEmail: null,
      documentsView: baseDocs,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NO_RECIPIENT');
  });

  it('allows explicit recipient without customer email', () => {
    const result = validateInvoiceEmailSend({
      type: OrgInvoiceType.OUTGOING_MANUAL,
      status: OrgInvoiceStatus.ISSUED,
      sequenceNumber: 1,
      customerEmail: null,
      explicitRecipient: 'payee@example.com',
      documentsView: baseDocs,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.documentId).toBe('doc-1');
  });

  it('detects PDF still generating', () => {
    const result = validateInvoiceEmailSend({
      type: OrgInvoiceType.OUTGOING_BOOKING,
      status: OrgInvoiceStatus.ISSUED,
      sequenceNumber: 1,
      customerEmail: 'a@b.de',
      documentsView: {
        activeDocumentId: null,
        cacheMismatch: false,
        documents: [
          {
            ...baseDocs.documents[0],
            id: 'doc-gen',
            lifecycle: 'GENERATING' as const,
            generationStatus: 'PROCESSING',
            downloadAvailable: false,
          },
        ],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PDF_GENERATING');
  });
});
