import { OrgInvoiceStatus, OrgInvoiceType } from '@prisma/client';
import { DOCUMENT_GENERATION_STATUS, DOCUMENT_STATUS, DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import {
  BOOKING_REF,
  DOC_BOOKING_INVOICE,
  INVOICE_BOOKING,
  ORG_A,
  ORG_B,
} from './__fixtures__/invoice-baseline.fixtures';
import { InvoiceDocumentsReadService } from './invoice-documents-read.service';

describe('InvoiceDocumentsReadService', () => {
  const invoiceType = OrgInvoiceType.OUTGOING_BOOKING;

  const docV1 = {
    id: 'doc-v1',
    organizationId: ORG_A,
    documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
    status: DOCUMENT_STATUS.VOID,
    fileName: 'v1.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 100,
    objectKey: 'k/v1.pdf',
    invoiceId: INVOICE_BOOKING,
    versionNumber: 1,
    isActiveVersion: false,
    generationStatus: null,
    generationErrorCode: null,
    lastErrorMessage: null,
    nextRetryAt: null,
    generatedByUserId: 'user-1',
    createdAt: new Date('2026-07-10T10:00:00.000Z'),
  };

  const docV2 = {
    ...docV1,
    id: DOC_BOOKING_INVOICE,
    status: DOCUMENT_STATUS.GENERATED,
    fileName: 'v2.pdf',
    objectKey: 'k/v2.pdf',
    versionNumber: 2,
    isActiveVersion: true,
    createdAt: new Date('2026-07-11T10:00:00.000Z'),
  };

  let prisma: { generatedDocument: { findMany: jest.Mock } };
  let service: InvoiceDocumentsReadService;

  beforeEach(() => {
    prisma = { generatedDocument: { findMany: jest.fn() } };
    service = new InvoiceDocumentsReadService(prisma as never);
  });

  it('returns single version as active with authorized download path', async () => {
    prisma.generatedDocument.findMany.mockResolvedValue([docV2]);

    const view = await service.getDocumentsForInvoice({
      organizationId: ORG_A,
      invoiceId: INVOICE_BOOKING,
      invoiceType,
    });

    expect(view.activeDocumentId).toBe(DOC_BOOKING_INVOICE);
    expect(view.documents).toHaveLength(1);
    expect(view.documents[0].isActive).toBe(true);
    expect(view.documents[0].lifecycle).toBe('ACTIVE');
    expect(view.documents[0].downloadPath).toBe(
      `/organizations/${ORG_A}/documents/${DOC_BOOKING_INVOICE}/download`,
    );
    expect(view.documents[0].downloadPath).not.toContain('organizations/org/bookings');
  });

  it('returns multiple versions ordered with replaced voided row', async () => {
    prisma.generatedDocument.findMany.mockResolvedValue([docV2, docV1]);

    const view = await service.getDocumentsForInvoice({
      organizationId: ORG_A,
      invoiceId: INVOICE_BOOKING,
      invoiceType,
    });

    expect(view.documents).toHaveLength(2);
    expect(view.documents[0].version).toBe(1);
    expect(view.documents[0].lifecycle).toBe('VOIDED');
    expect(view.documents[1].isActive).toBe(true);
  });

  it('uses legacy cache fallback when canonical query has no invoiceId links', async () => {
    const orphanCache = { ...docV2, invoiceId: null };
    prisma.generatedDocument.findMany.mockResolvedValue([orphanCache]);

    const view = await service.getDocumentsForInvoice({
      organizationId: ORG_A,
      invoiceId: INVOICE_BOOKING,
      invoiceType,
      cacheDocumentId: DOC_BOOKING_INVOICE,
    });

    expect(view.activeDocumentId).toBe(DOC_BOOKING_INVOICE);
  });

  it('marks failed generation lifecycle and retryable', async () => {
    prisma.generatedDocument.findMany.mockResolvedValue([
      {
        ...docV2,
        status: DOCUMENT_STATUS.FAILED,
        generationStatus: DOCUMENT_GENERATION_STATUS.FAILED,
        lastErrorMessage: 'render error',
        nextRetryAt: new Date('2026-07-12T10:00:00.000Z'),
        objectKey: '',
      },
    ]);

    const view = await service.getDocumentsForInvoice({
      organizationId: ORG_A,
      invoiceId: INVOICE_BOOKING,
      invoiceType,
      includeInternalErrors: true,
    });

    expect(view.documents[0].lifecycle).toBe('FAILED');
    expect(view.documents[0].retryable).toBe(true);
    expect(view.documents[0].lastError).toBe('render error');
    expect(view.documents[0].downloadAvailable).toBe(false);
  });

  it('returns empty documents for invoice type without PDF mapping', async () => {
    prisma.generatedDocument.findMany.mockResolvedValue([]);

    const view = await service.getDocumentsForInvoice({
      organizationId: ORG_A,
      invoiceId: INVOICE_BOOKING,
      invoiceType: OrgInvoiceType.OUTGOING_MANUAL,
    });

    expect(view.documents).toHaveLength(0);
    expect(view.activeDocumentId).toBeNull();
  });

  it('excludes foreign organization rows from output', async () => {
    prisma.generatedDocument.findMany.mockResolvedValue([
      { ...docV2, organizationId: ORG_B },
      docV2,
    ]);

    const view = await service.getDocumentsForInvoice({
      organizationId: ORG_A,
      invoiceId: INVOICE_BOOKING,
      invoiceType,
    });

    expect(view.documents).toHaveLength(1);
    expect(view.documents[0].id).toBe(DOC_BOOKING_INVOICE);
  });

  it('flags contradictory cache pointer', async () => {
    const stalePointer = {
      ...docV2,
      id: 'stale-cache-doc',
      versionNumber: 1,
      isActiveVersion: true,
      createdAt: new Date('2026-07-09T10:00:00.000Z'),
    };
    prisma.generatedDocument.findMany.mockResolvedValue([stalePointer, docV2]);

    const view = await service.getDocumentsForInvoice({
      organizationId: ORG_A,
      invoiceId: INVOICE_BOOKING,
      invoiceType,
      cacheDocumentId: 'stale-cache-doc',
    });

    expect(view.activeDocumentId).toBe(DOC_BOOKING_INVOICE);
    expect(view.cacheMismatch).toBe(true);
  });

  it('batch loads documents for multiple invoices in one query', async () => {
    prisma.generatedDocument.findMany.mockResolvedValue([docV2]);

    const map = await service.getDocumentsForInvoicesBatch(ORG_A, [
      {
        id: INVOICE_BOOKING,
        type: invoiceType,
        generatedDocumentId: null,
      },
    ]);

    expect(prisma.generatedDocument.findMany).toHaveBeenCalledTimes(1);
    expect(map.get(INVOICE_BOOKING)?.activeDocumentId).toBe(DOC_BOOKING_INVOICE);
  });

  it('omits lastError without includeInternalErrors', async () => {
    prisma.generatedDocument.findMany.mockResolvedValue([
      {
        ...docV2,
        status: DOCUMENT_STATUS.FAILED,
        generationStatus: DOCUMENT_GENERATION_STATUS.FAILED,
        lastErrorMessage: 'secret',
      },
    ]);

    const view = await service.getDocumentsForInvoice({
      organizationId: ORG_A,
      invoiceId: INVOICE_BOOKING,
      invoiceType,
    });

    expect(view.documents[0].lastError).toBeNull();
  });
});
