import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import { GeneratedDocument, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DOCUMENTS_STORAGE,
  DocumentStoragePort,
} from './storage/document-storage.interface';
import { DOCUMENT_ORIGIN, DOCUMENT_STATUS, DOCUMENT_TYPE } from './documents.constants';
import { dedupeDocumentsByType } from './document-list-dedupe.util';

export interface CreateGeneratedDocumentInput {
  organizationId: string;
  documentType: string;
  title: string;
  fileName: string;
  buffer: Buffer;
  mimeType?: string;
  origin?: string;
  bookingId?: string | null;
  customerId?: string | null;
  vehicleId?: string | null;
  invoiceId?: string | null;
  handoverProtocolId?: string | null;
  rentalContractId?: string | null;
  depositId?: string | null;
  legalDocumentId?: string | null;
  documentNumber?: string | null;
  templateKey?: string | null;
  templateVersion?: string | null;
  legalVersionLabel?: string | null;
  generatedByUserId?: string | null;
  metadata?: Record<string, unknown> | null;
  snapshot?: Record<string, unknown> | null;
}

export interface GeneratedDocumentDto {
  id: string;
  documentType: string;
  origin: string;
  status: string;
  title: string;
  documentNumber: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  bookingId: string | null;
  invoiceId: string | null;
  legalVersionLabel: string | null;
  generatedAt: string | null;
  createdAt: string;
}

export interface DocumentDownload {
  stream: Readable;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
}

/**
 * Owns generated/static document metadata + private file storage. Business
 * modules never write files directly — they call this service, which stores the
 * bytes under a safe key and records compact metadata. Files are served only via
 * authenticated, org-scoped download (stored file, never regenerated on read).
 */
@Injectable()
export class GeneratedDocumentsService {
  private readonly logger = new Logger(GeneratedDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENTS_STORAGE) private readonly storage: DocumentStoragePort,
  ) {}

  async createFromPdf(input: CreateGeneratedDocumentInput): Promise<GeneratedDocument> {
    const mimeType = input.mimeType ?? 'application/pdf';
    const stored = await this.storage.putObject({
      organizationId: input.organizationId,
      bookingId: input.bookingId ?? null,
      documentType: input.documentType,
      originalName: input.fileName,
      buffer: input.buffer,
      mimeType,
    });

    const checksum = createHash('sha256').update(input.buffer).digest('hex');

    return this.prisma.generatedDocument.create({
      data: {
        organizationId: input.organizationId,
        documentType: input.documentType,
        origin: input.origin ?? DOCUMENT_ORIGIN.GENERATED,
        status: DOCUMENT_STATUS.GENERATED,
        bookingId: input.bookingId ?? null,
        customerId: input.customerId ?? null,
        vehicleId: input.vehicleId ?? null,
        invoiceId: input.invoiceId ?? null,
        handoverProtocolId: input.handoverProtocolId ?? null,
        rentalContractId: input.rentalContractId ?? null,
        depositId: input.depositId ?? null,
        legalDocumentId: input.legalDocumentId ?? null,
        title: input.title,
        documentNumber: input.documentNumber ?? null,
        fileName: input.fileName,
        mimeType,
        storageProvider: stored.storageProvider,
        objectKey: stored.objectKey,
        sizeBytes: stored.sizeBytes,
        checksum,
        templateKey: input.templateKey ?? null,
        templateVersion: input.templateVersion ?? null,
        legalVersionLabel: input.legalVersionLabel ?? null,
        generatedAt: new Date(),
        generatedByUserId: input.generatedByUserId ?? null,
        metadata: (input.metadata as object) ?? undefined,
        snapshot: (input.snapshot as object) ?? undefined,
      },
    });
  }

  async getById(orgId: string, documentId: string): Promise<GeneratedDocument> {
    const doc = await this.prisma.generatedDocument.findFirst({
      where: { id: documentId, organizationId: orgId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async listForBooking(orgId: string, bookingId: string): Promise<GeneratedDocument[]> {
    const rows = await this.prisma.generatedDocument.findMany({
      where: { organizationId: orgId, bookingId },
      orderBy: { createdAt: 'asc' },
    });
    return dedupeDocumentsByType(rows);
  }

  /**
   * Lists documents for an invoice. Primary path: `GeneratedDocument.invoiceId`.
   *
   * Legacy fallbacks (phase-2 removal): `legacyDocumentId` (= OrgInvoice.generatedDocumentId)
   * and booking-scoped BOOKING_INVOICE/FINAL_INVOICE when `invoiceId` was not backfilled.
   * Run `scripts/ops/audit-invoice-document-links.ts` before removing OR branches.
   */
  async listForInvoice(
    orgId: string,
    invoiceId: string,
    bookingId?: string | null,
    legacyDocumentId?: string | null,
  ): Promise<GeneratedDocument[]> {
    const or: Prisma.GeneratedDocumentWhereInput[] = [{ invoiceId }];
    if (legacyDocumentId) {
      or.push({ id: legacyDocumentId });
    }
    if (bookingId) {
      or.push({
        bookingId,
        documentType: { in: ['BOOKING_INVOICE', 'FINAL_INVOICE'] },
      });
    }
    return this.prisma.generatedDocument.findMany({
      where: { organizationId: orgId, OR: or },
      orderBy: { createdAt: 'desc' },
    });
  }

  async voidDocument(orgId: string, documentId: string): Promise<GeneratedDocument> {
    await this.getById(orgId, documentId);
    return this.prisma.generatedDocument.update({
      where: { id: documentId },
      data: { status: DOCUMENT_STATUS.VOID, voidedAt: new Date() },
    });
  }

  /** Persists a failed PDF generation attempt for invoice document panels. */
  async recordInvoiceGenerationFailure(input: {
    organizationId: string;
    invoiceId: string;
    bookingId?: string | null;
    customerId?: string | null;
    vehicleId?: string | null;
    errorMessage: string;
    generatedByUserId?: string | null;
  }): Promise<GeneratedDocument> {
    const placeholder = Buffer.from('PDF generation failed', 'utf8');
    const stored = await this.storage.putObject({
      organizationId: input.organizationId,
      bookingId: input.bookingId ?? null,
      documentType: 'INVOICE_GENERATION_FAILED',
      originalName: `failed-${input.invoiceId}.txt`,
      buffer: placeholder,
      mimeType: 'text/plain',
    });

    return this.prisma.generatedDocument.create({
      data: {
        organizationId: input.organizationId,
        documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
        origin: DOCUMENT_ORIGIN.GENERATED,
        status: DOCUMENT_STATUS.FAILED,
        bookingId: input.bookingId ?? null,
        customerId: input.customerId ?? null,
        vehicleId: input.vehicleId ?? null,
        invoiceId: input.invoiceId,
        title: 'PDF-Erzeugung fehlgeschlagen',
        fileName: `failed-${input.invoiceId}.txt`,
        mimeType: 'text/plain',
        storageProvider: stored.storageProvider,
        objectKey: stored.objectKey,
        sizeBytes: stored.sizeBytes,
        generatedAt: new Date(),
        generatedByUserId: input.generatedByUserId ?? null,
        metadata: { errorMessage: input.errorMessage },
      },
    });
  }

  async voidAllForBooking(orgId: string, bookingId: string): Promise<number> {
    const docs = await this.listForBooking(orgId, bookingId);
    let count = 0;
    for (const doc of docs) {
      if (doc.status === DOCUMENT_STATUS.VOID) continue;
      await this.voidDocument(orgId, doc.id);
      count += 1;
    }
    return count;
  }

  /** Returns a stream + headers for an authenticated download. Serves the stored file. */
  async getDownload(orgId: string, documentId: string): Promise<DocumentDownload> {
    const doc = await this.getById(orgId, documentId);
    const stream = await this.storage.getObjectStream(doc.objectKey);
    return {
      stream,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
    };
  }

  toDto(doc: GeneratedDocument): GeneratedDocumentDto {
    return {
      id: doc.id,
      documentType: doc.documentType,
      origin: doc.origin,
      status: doc.status,
      title: doc.title,
      documentNumber: doc.documentNumber,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      bookingId: doc.bookingId,
      invoiceId: doc.invoiceId,
      legalVersionLabel: doc.legalVersionLabel,
      generatedAt: doc.generatedAt ? doc.generatedAt.toISOString() : null,
      createdAt: doc.createdAt.toISOString(),
    };
  }
}
