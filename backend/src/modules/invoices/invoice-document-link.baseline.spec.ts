import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Readable } from 'stream';

import { NotFoundException } from '@nestjs/common';

import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { DOCUMENT_TYPE, DOCUMENT_STATUS } from '@modules/documents/documents.constants';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { InvoiceNumberService } from './invoice-number.service';
import { InvoiceDocumentsReadService } from './invoice-documents-read.service';
import { mockInvoiceDocumentsRead } from './__fixtures__/invoice-documents-read.mock';
import {
  DOC_BOOKING_INVOICE,
  INVOICE_BOOKING,
  ORG_A,
  ORG_B,
  makeGeneratedBookingInvoiceDoc,
  makeOrgInvoiceRow,
} from './__fixtures__/invoice-baseline.fixtures';

describe('Invoice ↔ GeneratedDocument link — baseline regression', () => {
  const storage = {
    putObject: jest.fn().mockResolvedValue({
      objectKey: 'organizations/org-a/bookings/bk/BOOKING_INVOICE/2026/07/doc.pdf',
      storageProvider: 'local',
      sizeBytes: 12,
      mimeType: 'application/pdf',
    }),
    getObjectStream: jest.fn().mockResolvedValue(Readable.from([Buffer.from('%PDF')])),
  } as any;

  it('createFromPdf persists invoiceId on GeneratedDocument (canonical PDF → invoice link)', async () => {
    const prisma = {
      generatedDocument: {
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
          id: DOC_BOOKING_INVOICE,
          ...data,
        })),
      },
    } as any;
    const svc = new GeneratedDocumentsService(prisma, storage);

    const doc = await svc.createFromPdf({
      organizationId: ORG_A,
      documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
      title: 'Buchungsrechnung',
      fileName: 'booking_invoice.pdf',
      buffer: Buffer.from('%PDF-1.4'),
      bookingId: 'bk-1',
      invoiceId: INVOICE_BOOKING,
    });

    expect(doc.invoiceId).toBe(INVOICE_BOOKING);
    expect(prisma.generatedDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: INVOICE_BOOKING,
          documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
          status: DOCUMENT_STATUS.GENERATED,
        }),
      }),
    );
  });

  it('findById resolves generatedDocumentId from canonical invoiceId link when cache is null', async () => {
    const generated = makeGeneratedBookingInvoiceDoc();
    const invoiceRow = makeOrgInvoiceRow({ generatedDocumentId: null });

    const prisma = {
      orgInvoice: { findFirst: jest.fn().mockResolvedValue(invoiceRow) },
    } as unknown as PrismaService;
    const invoiceDocuments = mockInvoiceDocumentsRead({
      activeDocumentId: DOC_BOOKING_INVOICE,
      documents: [
        {
          id: DOC_BOOKING_INVOICE,
          documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
          filename: 'booking_invoice.pdf',
          version: 1,
          status: DOCUMENT_STATUS.GENERATED,
          generationStatus: null,
          lifecycle: 'ACTIVE',
          isActive: true,
          createdAt: '2026-07-10T10:10:00.000Z',
          createdBy: null,
          mimeType: 'application/pdf',
          sizeBytes: 12,
          downloadAvailable: true,
          previewAvailable: true,
          downloadPath: `/organizations/${ORG_A}/documents/${DOC_BOOKING_INVOICE}/download`,
          lastError: null,
          retryable: false,
        },
      ],
    });
    const service = new InvoicesService(
      prisma,
      { upsertByDedup: jest.fn() } as unknown as TasksService,
      { allocate: jest.fn() } as unknown as InvoiceNumberService,
      invoiceDocuments as unknown as InvoiceDocumentsReadService,
    );

    const dto = await service.findById(INVOICE_BOOKING, ORG_A);
    expect(dto.generatedDocumentId).toBe(DOC_BOOKING_INVOICE);
    expect(dto.activeDocumentId).toBe(DOC_BOOKING_INVOICE);
    expect(dto.documents).toHaveLength(1);
    expect(generated.invoiceId).toBe(dto.id);
  });

  it('findById keeps generatedDocumentId null when no documents exist', async () => {
    const invoiceRow = makeOrgInvoiceRow({ generatedDocumentId: null });
    const prisma = {
      orgInvoice: { findFirst: jest.fn().mockResolvedValue(invoiceRow) },
    } as unknown as PrismaService;
    const service = new InvoicesService(
      prisma,
      { upsertByDedup: jest.fn() } as unknown as TasksService,
      { allocate: jest.fn() } as unknown as InvoiceNumberService,
      mockInvoiceDocumentsRead() as unknown as InvoiceDocumentsReadService,
    );

    const dto = await service.findById(INVOICE_BOOKING, ORG_A);
    expect(dto.generatedDocumentId).toBeNull();
  });

  it('InvoicesService does not persist generatedDocumentId on orgInvoice create/update', () => {
    const source = readFileSync(resolve(__dirname, 'invoices.service.ts'), 'utf8');
    expect(source).not.toMatch(/orgInvoice\.create\([\s\S]*generatedDocumentId/);
    expect(source).not.toMatch(/orgInvoice\.update\([\s\S]*generatedDocumentId/);
    expect(source).not.toMatch(/updateData\.generatedDocumentId/);
  });

  describe('tenant isolation — document access', () => {
    it('getById rejects cross-org document lookup', async () => {
      const prisma = {
        generatedDocument: { findFirst: jest.fn().mockResolvedValue(null) },
      } as any;
      const svc = new GeneratedDocumentsService(prisma, storage);

      await expect(svc.getById(ORG_A, DOC_BOOKING_INVOICE)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.generatedDocument.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: DOC_BOOKING_INVOICE, organizationId: ORG_A },
        }),
      );
    });

    it('invoice detail for org B cannot read org A invoice', async () => {
      const prisma = {
        orgInvoice: { findFirst: jest.fn().mockResolvedValue(null) },
      } as unknown as PrismaService;
      const service = new InvoicesService(
        prisma,
        { upsertByDedup: jest.fn() } as unknown as TasksService,
        { allocate: jest.fn() } as unknown as InvoiceNumberService,
        mockInvoiceDocumentsRead() as unknown as InvoiceDocumentsReadService,
      );

      await expect(service.findById(INVOICE_BOOKING, ORG_B)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('target state — canonical read path', () => {
    it('findById returns generatedDocumentId from cache when read service resolves active doc', async () => {
      const invoiceRow = makeOrgInvoiceRow({ generatedDocumentId: DOC_BOOKING_INVOICE });
      const prisma = {
        orgInvoice: { findFirst: jest.fn().mockResolvedValue(invoiceRow) },
      } as unknown as PrismaService;
      const service = new InvoicesService(
        prisma,
        { upsertByDedup: jest.fn() } as unknown as TasksService,
        { allocate: jest.fn() } as unknown as InvoiceNumberService,
        mockInvoiceDocumentsRead({ activeDocumentId: DOC_BOOKING_INVOICE }) as unknown as InvoiceDocumentsReadService,
      );
      const dto = await service.findById(INVOICE_BOOKING, ORG_A);
      expect(dto.generatedDocumentId).toBe(DOC_BOOKING_INVOICE);
    });
  });
});
