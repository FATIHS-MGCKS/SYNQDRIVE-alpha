import { Injectable } from '@nestjs/common';
import { OrgInvoiceType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { expectedDocumentTypeForInvoice } from './invoice-document-integrity-audit.util';
import type {
  InvoiceDocumentsReadOptions,
  InvoiceDocumentsViewDto,
  InvoiceDocumentSummaryDto,
} from './invoice-document-read.types';
import {
  buildAuthorizedDownloadPath,
  filterIntegrityValidDocuments,
  InvoiceDocumentReadRow,
  isRetryableDocument,
  mapDocumentLifecycle,
  resolveCanonicalActiveDocumentId,
  sortInvoiceDocuments,
} from './invoice-document-read.util';
import { hasStorageKey } from './invoice-document-integrity-audit.util';

const DOCUMENT_SELECT = {
  id: true,
  organizationId: true,
  documentType: true,
  status: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  objectKey: true,
  invoiceId: true,
  versionNumber: true,
  isActiveVersion: true,
  generationStatus: true,
  generationErrorCode: true,
  lastErrorMessage: true,
  nextRetryAt: true,
  generatedByUserId: true,
  createdAt: true,
} as const;

@Injectable()
export class InvoiceDocumentsReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getDocumentsForInvoice(options: InvoiceDocumentsReadOptions): Promise<InvoiceDocumentsViewDto> {
    const rows = await this.fetchDocumentRows(
      options.organizationId,
      options.invoiceId,
      options.cacheDocumentId ?? null,
    );
    return this.buildView({
      ...options,
      rows,
    });
  }

  /** Batch load for list endpoints — one query per org, grouped in memory. */
  async getDocumentsForInvoicesBatch(
    organizationId: string,
    invoices: Array<{
      id: string;
      type: OrgInvoiceType;
      generatedDocumentId: string | null;
    }>,
    options?: { includeInternalErrors?: boolean },
  ): Promise<Map<string, InvoiceDocumentsViewDto>> {
    if (invoices.length === 0) return new Map();

    const invoiceIds = invoices.map((i) => i.id);
    const cacheIds = invoices.map((i) => i.generatedDocumentId).filter(Boolean) as string[];

    const rows = await this.prisma.generatedDocument.findMany({
      where: {
        organizationId,
        OR: [
          { invoiceId: { in: invoiceIds } },
          ...(cacheIds.length > 0 ? [{ id: { in: cacheIds } }] : []),
        ],
      },
      select: DOCUMENT_SELECT,
      orderBy: [{ versionNumber: 'asc' }, { createdAt: 'asc' }],
    });

    const byInvoiceId = new Map<string, InvoiceDocumentReadRow[]>();
    for (const row of rows) {
      if (row.invoiceId) {
        const list = byInvoiceId.get(row.invoiceId) ?? [];
        list.push(row);
        byInvoiceId.set(row.invoiceId, list);
      }
    }

    const result = new Map<string, InvoiceDocumentsViewDto>();
    for (const invoice of invoices) {
      const invoiceRows = byInvoiceId.get(invoice.id) ?? [];
      const cacheRow = invoice.generatedDocumentId
        ? rows.find((r) => r.id === invoice.generatedDocumentId)
        : undefined;
      const merged =
        cacheRow && !invoiceRows.some((r) => r.id === cacheRow.id)
          ? [...invoiceRows, cacheRow]
          : invoiceRows;

      result.set(
        invoice.id,
        this.buildView({
          organizationId,
          invoiceId: invoice.id,
          invoiceType: invoice.type,
          cacheDocumentId: invoice.generatedDocumentId,
          includeInternalErrors: options?.includeInternalErrors,
          rows: merged,
        }),
      );
    }

    return result;
  }

  private async fetchDocumentRows(
    organizationId: string,
    invoiceId: string,
    cacheDocumentId: string | null,
  ): Promise<InvoiceDocumentReadRow[]> {
    return this.prisma.generatedDocument.findMany({
      where: {
        organizationId,
        OR: [
          { invoiceId },
          ...(cacheDocumentId ? [{ id: cacheDocumentId }] : []),
        ],
      },
      select: DOCUMENT_SELECT,
      orderBy: [{ versionNumber: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private buildView(args: {
    organizationId: string;
    invoiceId: string;
    invoiceType: string;
    cacheDocumentId?: string | null;
    includeInternalErrors?: boolean;
    rows: InvoiceDocumentReadRow[];
  }): InvoiceDocumentsViewDto {
    const expectedType = expectedDocumentTypeForInvoice(args.invoiceType as OrgInvoiceType);
    const validRows = filterIntegrityValidDocuments(
      args.rows,
      args.organizationId,
      args.invoiceId,
    );

    if (!expectedType) {
      return {
        activeDocumentId: args.cacheDocumentId ?? null,
        cacheMismatch: false,
        documents: [],
      };
    }

    const typedRows = validRows.filter((d) => d.documentType === expectedType);
    const { activeDocumentId, cacheMismatch } = resolveCanonicalActiveDocumentId(
      validRows,
      expectedType,
      args.cacheDocumentId ?? null,
      args.invoiceId,
    );

    const sorted = sortInvoiceDocuments(typedRows);
    const documents: InvoiceDocumentSummaryDto[] = sorted.map((doc) =>
      this.toSummary(doc, {
        organizationId: args.organizationId,
        isActive: doc.id === activeDocumentId,
        includeInternalErrors: args.includeInternalErrors ?? false,
      }),
    );

    return {
      activeDocumentId,
      cacheMismatch,
      documents,
    };
  }

  private toSummary(
    doc: InvoiceDocumentReadRow,
    ctx: { organizationId: string; isActive: boolean; includeInternalErrors: boolean },
  ): InvoiceDocumentSummaryDto {
    const downloadable = hasStorageKey(doc.objectKey);
    const lifecycle = mapDocumentLifecycle(doc, ctx.isActive);

    return {
      id: doc.id,
      documentType: doc.documentType,
      filename: doc.fileName,
      version: doc.versionNumber,
      status: doc.status,
      generationStatus: doc.generationStatus,
      lifecycle,
      isActive: ctx.isActive,
      createdAt: doc.createdAt.toISOString(),
      createdBy: doc.generatedByUserId,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      downloadAvailable: downloadable,
      previewAvailable: downloadable && doc.mimeType === 'application/pdf',
      downloadPath: downloadable
        ? buildAuthorizedDownloadPath(ctx.organizationId, doc.id)
        : null,
      lastError: ctx.includeInternalErrors ? doc.lastErrorMessage : null,
      retryable: isRetryableDocument(doc),
    };
  }
}
