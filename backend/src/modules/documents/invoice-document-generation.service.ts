import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { GeneratedDocument } from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  expectedDocumentTypeForInvoice,
  isInvoiceDocumentType,
} from '@modules/invoices/invoice-document-integrity-audit.util';
import {
  DOCUMENT_GENERATION_STATUS,
  DOCUMENT_ORIGIN,
  DOCUMENT_STATUS,
} from './documents.constants';
import {
  DOCUMENTS_STORAGE,
  DocumentStoragePort,
} from './storage/document-storage.interface';
import {
  GenerateInvoiceDocumentInput,
  InvoiceDocumentGenerationError,
  InvoiceDocumentGenerationResult,
} from './invoice-document-generation.types';
import {
  classifyGenerationError,
  computeNextRetryAt,
  generationLockKey,
  isInFlightGeneration,
  isRetryableErrorCode,
  PENDING_OBJECT_KEY,
  sanitizeErrorMessage,
} from './invoice-document-generation.util';

@Injectable()
export class InvoiceDocumentGenerationService {
  private readonly logger = new Logger(InvoiceDocumentGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENTS_STORAGE) private readonly storage: DocumentStoragePort,
    private readonly activityLog: ActivityLogService,
  ) {}

  /**
   * Canonical write path for invoice-linked PDFs (BOOKING_INVOICE, FINAL_INVOICE).
   * Reserves version + PROCESSING row before render; activates only after storage.
   */
  async generate(input: GenerateInvoiceDocumentInput): Promise<InvoiceDocumentGenerationResult> {
    if (!isInvoiceDocumentType(input.documentType)) {
      throw new InvoiceDocumentGenerationError(
        'Not an invoice document type',
        'INTEGRITY_ERROR',
        false,
      );
    }

    const lockKey = generationLockKey(input.organizationId, input.invoiceId, input.documentType);
    await this.prisma.$executeRaw`SELECT pg_advisory_lock(hashtext(${lockKey}))`;

    try {
      return await this.generateLocked(input);
    } finally {
      await this.prisma.$executeRaw`SELECT pg_advisory_unlock(hashtext(${lockKey}))`;
    }
  }

  /** Retry a previously failed generation attempt (creates a new version). */
  async retryFailed(
    organizationId: string,
    documentId: string,
    renderPdf: () => Promise<Buffer>,
    generatedByUserId?: string | null,
  ): Promise<InvoiceDocumentGenerationResult> {
    const failed = await this.prisma.generatedDocument.findFirst({
      where: { id: documentId, organizationId },
    });
    if (!failed || !failed.invoiceId) {
      throw new NotFoundException('Failed invoice document not found');
    }
    if (!isInvoiceDocumentType(failed.documentType)) {
      throw new InvoiceDocumentGenerationError('Not an invoice document', 'INTEGRITY_ERROR', false);
    }
    if (failed.generationStatus !== DOCUMENT_GENERATION_STATUS.FAILED) {
      throw new ConflictException('Document is not in a failed generation state');
    }

    return this.generate({
      organizationId,
      invoiceId: failed.invoiceId,
      documentType: failed.documentType,
      title: failed.title,
      fileName: failed.fileName,
      renderPdf,
      bookingId: failed.bookingId,
      customerId: failed.customerId,
      vehicleId: failed.vehicleId,
      documentNumber: failed.documentNumber,
      templateKey: failed.templateKey,
      templateVersion: failed.templateVersion,
      generatedByUserId: generatedByUserId ?? failed.generatedByUserId,
      snapshot: (failed.snapshot as Record<string, unknown> | null) ?? null,
      force: true,
      idempotencyKey: `retry:${failed.id}`,
    });
  }

  private async generateLocked(
    input: GenerateInvoiceDocumentInput,
  ): Promise<InvoiceDocumentGenerationResult> {
    const invoice = await this.prisma.orgInvoice.findFirst({
      where: { id: input.invoiceId, organizationId: input.organizationId },
    });
    if (!invoice) {
      throw new InvoiceDocumentGenerationError('Invoice not found', 'INVOICE_NOT_FOUND', false);
    }

    const expectedType = expectedDocumentTypeForInvoice(invoice.type);
    if (!expectedType || expectedType !== input.documentType) {
      throw new InvoiceDocumentGenerationError(
        'Invoice type does not match document type',
        'INTEGRITY_ERROR',
        false,
      );
    }

    if (!input.force) {
      const existingActive = await this.findActiveStoredDocument(
        input.organizationId,
        input.invoiceId,
        input.documentType,
      );
      if (existingActive) {
        return {
          document: existingActive,
          created: false,
          versionNumber: existingActive.versionNumber ?? 1,
        };
      }
    }

    const inFlight = await this.findInFlightDocument(
      input.organizationId,
      input.invoiceId,
      input.documentType,
    );
    if (inFlight && input.idempotencyKey) {
      const meta = (inFlight.metadata as Record<string, unknown> | null) ?? {};
      if (meta.idempotencyKey === input.idempotencyKey) {
        return this.completeInFlight(inFlight, input);
      }
    }
    if (inFlight) {
      throw new InvoiceDocumentGenerationError(
        'Invoice document generation already in progress',
        'CONCURRENT_GENERATION',
        true,
      );
    }

    const { documentId, versionNumber, attemptCount } = await this.reserveDocumentVersion(input);

    try {
      const buffer = await input.renderPdf();
      const stored = await this.storage.putObject({
        organizationId: input.organizationId,
        bookingId: input.bookingId ?? null,
        documentType: input.documentType,
        originalName: input.fileName,
        buffer,
        mimeType: 'application/pdf',
      });
      const checksum = createHash('sha256').update(buffer).digest('hex');

      const document = await this.activateDocument({
        documentId,
        organizationId: input.organizationId,
        invoiceId: input.invoiceId,
        documentType: input.documentType,
        stored,
        checksum,
        attemptCount,
        force: input.force ?? false,
        userId: input.generatedByUserId ?? null,
        versionNumber,
      });

      await this.writeAuditEvent({
        organizationId: input.organizationId,
        invoiceId: input.invoiceId,
        documentId: document.id,
        documentType: input.documentType,
        versionNumber,
        userId: input.generatedByUserId ?? null,
        force: input.force ?? false,
        succeeded: true,
      });

      return { document, created: true, versionNumber };
    } catch (err) {
      await this.persistFailure(documentId, attemptCount, err);
      await this.writeAuditEvent({
        organizationId: input.organizationId,
        invoiceId: input.invoiceId,
        documentId,
        documentType: input.documentType,
        versionNumber,
        userId: input.generatedByUserId ?? null,
        force: input.force ?? false,
        succeeded: false,
        error: err,
      });
      if (err instanceof InvoiceDocumentGenerationError) throw err;
      const classified = classifyGenerationError(err);
      throw new InvoiceDocumentGenerationError(
        classified.message,
        classified.code,
        classified.retryable,
        err,
      );
    }
  }

  private async completeInFlight(
    inFlight: GeneratedDocument,
    input: GenerateInvoiceDocumentInput,
  ): Promise<InvoiceDocumentGenerationResult> {
    const attemptCount = (inFlight.generationAttemptCount ?? 0) + 1;
    try {
      const buffer = await input.renderPdf();
      const stored = await this.storage.putObject({
        organizationId: input.organizationId,
        bookingId: input.bookingId ?? null,
        documentType: input.documentType,
        originalName: input.fileName,
        buffer,
        mimeType: 'application/pdf',
      });
      const checksum = createHash('sha256').update(buffer).digest('hex');
      const document = await this.activateDocument({
        documentId: inFlight.id,
        organizationId: input.organizationId,
        invoiceId: input.invoiceId,
        documentType: input.documentType,
        stored,
        checksum,
        attemptCount,
        force: input.force ?? false,
        userId: input.generatedByUserId ?? null,
        versionNumber: inFlight.versionNumber ?? 1,
      });
      return {
        document,
        created: true,
        versionNumber: inFlight.versionNumber ?? 1,
      };
    } catch (err) {
      await this.persistFailure(inFlight.id, attemptCount, err);
      throw err;
    }
  }

  private async reserveDocumentVersion(input: GenerateInvoiceDocumentInput): Promise<{
    documentId: string;
    versionNumber: number;
    attemptCount: number;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const maxRow = await tx.generatedDocument.findFirst({
        where: {
          organizationId: input.organizationId,
          invoiceId: input.invoiceId,
          documentType: input.documentType,
          versionNumber: { not: null },
        },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      const versionNumber = (maxRow?.versionNumber ?? 0) + 1;
      const attemptCount = 1;

      const row = await tx.generatedDocument.create({
        data: {
          organizationId: input.organizationId,
          documentType: input.documentType,
          origin: DOCUMENT_ORIGIN.GENERATED,
          status: DOCUMENT_STATUS.DRAFT,
          generationStatus: DOCUMENT_GENERATION_STATUS.PROCESSING,
          bookingId: input.bookingId ?? null,
          customerId: input.customerId ?? null,
          vehicleId: input.vehicleId ?? null,
          invoiceId: input.invoiceId,
          versionNumber,
          isActiveVersion: false,
          generationAttemptCount: attemptCount,
          lastGenerationAttemptAt: new Date(),
          title: input.title,
          documentNumber: input.documentNumber ?? null,
          fileName: input.fileName,
          mimeType: 'application/pdf',
          storageProvider: 'local',
          objectKey: PENDING_OBJECT_KEY,
          templateKey: input.templateKey ?? input.documentType,
          templateVersion: input.templateVersion ?? '1',
          generatedByUserId: input.generatedByUserId ?? null,
          snapshot: (input.snapshot as object) ?? undefined,
          metadata: input.idempotencyKey
            ? ({ idempotencyKey: input.idempotencyKey } as object)
            : undefined,
        },
      });

      return { documentId: row.id, versionNumber, attemptCount };
    });
  }

  private async activateDocument(args: {
    documentId: string;
    organizationId: string;
    invoiceId: string;
    documentType: string;
    stored: { objectKey: string; storageProvider: string; sizeBytes: number };
    checksum: string;
    attemptCount: number;
    force: boolean;
    userId: string | null;
    versionNumber: number;
  }): Promise<GeneratedDocument> {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.orgInvoice.findFirst({
        where: { id: args.invoiceId, organizationId: args.organizationId },
      });
      if (!invoice) {
        throw new InvoiceDocumentGenerationError('Invoice not found', 'INVOICE_NOT_FOUND', false);
      }

      const previousActive = await tx.generatedDocument.findMany({
        where: {
          organizationId: args.organizationId,
          invoiceId: args.invoiceId,
          documentType: args.documentType,
          isActiveVersion: true,
          id: { not: args.documentId },
        },
      });

      const document = await tx.generatedDocument.update({
        where: { id: args.documentId },
        data: {
          status: DOCUMENT_STATUS.GENERATED,
          generationStatus: DOCUMENT_GENERATION_STATUS.SUCCEEDED,
          generationErrorCode: null,
          lastErrorMessage: null,
          nextRetryAt: null,
          generationAttemptCount: args.attemptCount,
          lastGenerationAttemptAt: new Date(),
          objectKey: args.stored.objectKey,
          storageProvider: args.stored.storageProvider,
          sizeBytes: args.stored.sizeBytes,
          checksum: args.checksum,
          isActiveVersion: true,
          generatedAt: new Date(),
        },
      });

      if (previousActive.length > 0) {
        await tx.generatedDocument.updateMany({
          where: {
            id: { in: previousActive.map((d) => d.id) },
          },
          data: {
            isActiveVersion: false,
            ...(args.force
              ? { status: DOCUMENT_STATUS.VOID, voidedAt: new Date() }
              : {}),
          },
        });
      }

      await tx.orgInvoice.update({
        where: { id: args.invoiceId },
        data: { generatedDocumentId: document.id },
      });

      return document;
    });
  }

  private async persistFailure(
    documentId: string,
    attemptCount: number,
    err: unknown,
  ): Promise<void> {
    const { code, message, retryable } = classifyGenerationError(err);
    const nextRetryAt = retryable ? computeNextRetryAt(attemptCount) : null;
    const generationStatus = retryable
      ? DOCUMENT_GENERATION_STATUS.RETRY_SCHEDULED
      : DOCUMENT_GENERATION_STATUS.FAILED;

    try {
      await this.prisma.generatedDocument.update({
        where: { id: documentId },
        data: {
          status: DOCUMENT_STATUS.FAILED,
          generationStatus,
          generationErrorCode: code,
          lastErrorMessage: sanitizeErrorMessage(message),
          generationAttemptCount: attemptCount,
          lastGenerationAttemptAt: new Date(),
          nextRetryAt,
          isActiveVersion: false,
        },
      });
    } catch (dbErr) {
      this.logger.error(
        `Failed to persist invoice document generation failure for ${documentId}`,
        dbErr instanceof Error ? dbErr.stack : String(dbErr),
      );
    }
  }

  private async findActiveStoredDocument(
    organizationId: string,
    invoiceId: string,
    documentType: string,
  ): Promise<GeneratedDocument | null> {
    const flagged = await this.prisma.generatedDocument.findFirst({
      where: {
        organizationId,
        invoiceId,
        documentType,
        isActiveVersion: true,
        status: { in: [DOCUMENT_STATUS.GENERATED, DOCUMENT_STATUS.SENT] },
        objectKey: { not: PENDING_OBJECT_KEY },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (flagged) return flagged;

    return this.prisma.generatedDocument.findFirst({
      where: {
        organizationId,
        invoiceId,
        documentType,
        status: { in: [DOCUMENT_STATUS.GENERATED, DOCUMENT_STATUS.SENT] },
        objectKey: { not: PENDING_OBJECT_KEY },
      },
      orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async findInFlightDocument(
    organizationId: string,
    invoiceId: string,
    documentType: string,
  ): Promise<GeneratedDocument | null> {
    const rows = await this.prisma.generatedDocument.findMany({
      where: {
        organizationId,
        invoiceId,
        documentType,
        OR: [
          { generationStatus: DOCUMENT_GENERATION_STATUS.PROCESSING },
          { generationStatus: DOCUMENT_GENERATION_STATUS.PENDING },
          {
            status: DOCUMENT_STATUS.DRAFT,
            objectKey: PENDING_OBJECT_KEY,
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    return rows.find((r) => isInFlightGeneration(r)) ?? null;
  }

  private async writeAuditEvent(args: {
    organizationId: string;
    invoiceId: string;
    documentId: string;
    documentType: string;
    versionNumber: number;
    userId: string | null;
    force: boolean;
    succeeded: boolean;
    error?: unknown;
  }): Promise<void> {
    try {
      const action = args.force ? 'UPDATE' : 'CREATE';
      const verb = args.succeeded ? 'generated' : 'generation failed';
      await this.activityLog.log({
        organizationId: args.organizationId,
        userId: args.userId ?? undefined,
        action,
        entity: 'INVOICE',
        entityId: args.invoiceId,
        description: `Invoice document ${args.documentType} v${args.versionNumber} ${verb}`,
        metaJson: {
          documentId: args.documentId,
          documentType: args.documentType,
          versionNumber: args.versionNumber,
          force: args.force,
          succeeded: args.succeeded,
          errorCode:
            args.error && isRetryableErrorCode(classifyGenerationError(args.error).code)
              ? classifyGenerationError(args.error).code
              : args.error
                ? classifyGenerationError(args.error).code
                : undefined,
        },
      });
    } catch (auditErr) {
      this.logger.warn(
        `Audit log failed for invoice document ${args.documentId}: ${auditErr instanceof Error ? auditErr.message : auditErr}`,
      );
    }
  }
}
