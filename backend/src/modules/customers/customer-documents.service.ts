import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  CustomerDocument,
  CustomerDocumentType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StorageService } from '@shared/storage/storage.service';
import { CustomerVerificationService } from '@modules/customer-verification/customer-verification.service';
import { ReviewCustomerDocumentDto } from './dto/review-customer-document.dto';
import { UploadCustomerDocumentDto } from './dto/upload-customer-document.dto';
import { CustomerTimelineService } from './customer-timeline.service';
import { WorkflowEventOutboxEmitterService } from '@modules/workflows/outbox/workflow-event-outbox-emitter.service';
import { buildDocumentExpiringOccurrenceId } from '@modules/workflows/outbox/workflow-event-occurrence.util';
import { mapCustomerDocumentTypeToRegistry } from './customer-document-type.util';

@Injectable()
export class CustomerDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly timeline: CustomerTimelineService,
    private readonly verificationService: CustomerVerificationService,
    @Optional() private readonly workflowEmitter?: WorkflowEventOutboxEmitterService,
  ) {}

  async uploadDocument(
    orgId: string,
    customerId: string,
    file: Express.Multer.File,
    dto: UploadCustomerDocumentDto,
    userId?: string,
  ): Promise<CustomerDocument> {
    await this.assertCustomer(orgId, customerId);

    const fileKey = await this.storage.finalizeUpload(
      'customer-documents',
      file,
      orgId,
    );

    const doc = await this.prisma.customerDocument.create({
      data: {
        organizationId: orgId,
        customerId,
        type: dto.type,
        status: 'PENDING_REVIEW',
        fileKey,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedByUserId: userId ?? null,
      },
    });

    await this.syncVerificationReadModel(orgId, customerId);
    await this.timeline.addEvent(
      orgId,
      customerId,
      'DOCUMENT_UPLOADED',
      `Dokument hochgeladen: ${dto.type}`,
      { documentId: doc.id, type: dto.type },
      userId,
    );

    return doc;
  }

  async listDocuments(orgId: string, customerId: string) {
    await this.assertCustomer(orgId, customerId);
    return this.prisma.customerDocument.findMany({
      where: { organizationId: orgId, customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocumentVerificationStatus(orgId: string, customerId: string) {
    await this.assertCustomer(orgId, customerId);
    return this.verificationService.getDocumentVerificationStatus(orgId, customerId);
  }

  async getDocument(orgId: string, customerId: string, documentId: string) {
    const doc = await this.prisma.customerDocument.findFirst({
      where: { id: documentId, organizationId: orgId, customerId },
    });
    if (!doc) throw new NotFoundException('Customer document not found');
    return doc;
  }

  async reviewDocument(
    orgId: string,
    customerId: string,
    documentId: string,
    dto: ReviewCustomerDocumentDto,
    userId?: string,
  ): Promise<CustomerDocument> {
    if (dto.status !== 'VERIFIED' && dto.status !== 'REJECTED') {
      throw new BadRequestException(
        'Review status must be VERIFIED or REJECTED',
      );
    }
    if (dto.status === 'REJECTED' && !dto.rejectedReason?.trim()) {
      throw new BadRequestException(
        'rejectedReason is required when rejecting a document',
      );
    }

    await this.getDocument(orgId, customerId, documentId);

    const updated = await this.prisma.customerDocument.update({
      where: { id: documentId },
      data: {
        status: dto.status,
        reviewedByUserId: userId ?? null,
        reviewedAt: new Date(),
        rejectedReason:
          dto.status === 'REJECTED' ? dto.rejectedReason!.trim() : null,
      },
    });

    await this.verificationService.recordManualDocumentReview({
      organizationId: orgId,
      customerId,
      document: updated,
      status: dto.status,
      userId,
      rejectedReason: dto.rejectedReason ?? null,
    });

    return updated;
  }

  async markExpiredDocuments(): Promise<number> {
    const now = new Date();
    const expired = await this.prisma.customerDocument.updateMany({
      where: {
        expiresAt: { lt: now },
        status: { in: ['UPLOADED', 'PENDING_REVIEW', 'VERIFIED'] },
      },
      data: { status: 'EXPIRED' },
    });

    // Recompute per affected customer — batch by distinct customer ids.
    const affected = await this.prisma.customerDocument.findMany({
      where: {
        expiresAt: { lt: now },
        status: 'EXPIRED',
      },
      select: { organizationId: true, customerId: true },
      distinct: ['customerId'],
    });
    for (const row of affected) {
      await this.syncVerificationReadModel(row.organizationId, row.customerId);
    }
    return expired.count;
  }

  /**
   * Scans verified customer documents approaching expiry and enqueues
   * `customer.document.expiring` workflow events (idempotent per document + expiry date).
   */
  async emitExpiringDocumentEvents(warnWithinDays = 30): Promise<number> {
    if (!this.workflowEmitter?.isGroupEnabled('customer')) return 0;

    const now = new Date();
    const warnUntil = new Date(now);
    warnUntil.setDate(warnUntil.getDate() + warnWithinDays);

    const documents = await this.prisma.customerDocument.findMany({
      where: {
        status: 'VERIFIED',
        expiresAt: { gte: now, lte: warnUntil },
      },
      select: {
        id: true,
        organizationId: true,
        customerId: true,
        type: true,
        expiresAt: true,
      },
      take: 500,
      orderBy: { expiresAt: 'asc' },
    });

    let emitted = 0;
    for (const doc of documents) {
      if (!doc.expiresAt) continue;
      const expiresOn = doc.expiresAt.toISOString().slice(0, 10);
      const occurrenceId = buildDocumentExpiringOccurrenceId(
        doc.customerId,
        doc.id,
        expiresOn,
      );

      const row = await this.workflowEmitter.enqueueStandalone({
        group: 'customer',
        organizationId: doc.organizationId,
        eventType: 'customer.document.expiring',
        source: 'customers',
        entityType: 'customer',
        entityId: doc.customerId,
        correlationId: `customer-documents:${doc.customerId}`,
        occurrenceId,
        payload: {
          customerId: doc.customerId,
          documentId: doc.id,
          documentType: mapCustomerDocumentTypeToRegistry(doc.type),
          expiresAt: doc.expiresAt.toISOString(),
        },
      });

      if (row) emitted += 1;
    }

    return emitted;
  }

  /** @deprecated use CustomerVerificationService.syncCustomerReadModel */
  async recomputeVerificationStatus(
    orgId: string,
    customerId: string,
  ): Promise<void> {
    await this.syncVerificationReadModel(orgId, customerId);
  }

  private async syncVerificationReadModel(
    orgId: string,
    customerId: string,
  ): Promise<void> {
    await this.verificationService.syncCustomerReadModel(orgId, customerId);
  }

  private async assertCustomer(orgId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId: orgId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }
}
