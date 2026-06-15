import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerDocument,
  CustomerDocumentStatus,
  CustomerDocumentType,
  CustomerVerificationStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StorageService } from '@shared/storage/storage.service';
import { ReviewCustomerDocumentDto } from './dto/review-customer-document.dto';
import { UploadCustomerDocumentDto } from './dto/upload-customer-document.dto';
import { CustomerTimelineService } from './customer-timeline.service';

const ID_TYPES: CustomerDocumentType[] = ['ID_FRONT', 'ID_BACK'];
const LICENSE_TYPES: CustomerDocumentType[] = ['LICENSE_FRONT', 'LICENSE_BACK'];

@Injectable()
export class CustomerDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly timeline: CustomerTimelineService,
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

    await this.recomputeVerificationStatus(orgId, customerId);
    await this.timeline.addEvent(
      orgId,
      customerId,
      'DOCUMENT_UPLOADED',
      `Document uploaded: ${dto.type}`,
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

    await this.recomputeVerificationStatus(orgId, customerId);
    await this.timeline.addEvent(
      orgId,
      customerId,
      dto.status === 'VERIFIED' ? 'DOCUMENT_VERIFIED' : 'DOCUMENT_REJECTED',
      dto.status === 'VERIFIED'
        ? `Document verified: ${updated.type}`
        : `Document rejected: ${updated.type}`,
      { documentId, type: updated.type, rejectedReason: dto.rejectedReason },
      userId,
    );

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
      await this.recomputeVerificationStatus(row.organizationId, row.customerId);
    }
    return expired.count;
  }

  async recomputeVerificationStatus(
    orgId: string,
    customerId: string,
  ): Promise<void> {
    const customer = await this.assertCustomer(orgId, customerId);
    const docs = await this.prisma.customerDocument.findMany({
      where: { organizationId: orgId, customerId },
    });

    const idStatus = this.computeCategoryStatus(
      docs.filter((d) => ID_TYPES.includes(d.type)),
      customer.idExpiry,
    );
    const licenseStatus = this.computeCategoryStatus(
      docs.filter((d) => LICENSE_TYPES.includes(d.type)),
      customer.licenseExpiry,
    );

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        idVerificationStatus: idStatus,
        licenseVerificationStatus: licenseStatus,
        // Keep legacy booleans in sync for backward-compatible reads.
        idVerified: idStatus === 'VERIFIED',
        licenseVerified: licenseStatus === 'VERIFIED',
      },
    });
  }

  private computeCategoryStatus(
    docs: CustomerDocument[],
    expiryDate: Date | null,
  ): CustomerVerificationStatus {
    const now = new Date();
    if (expiryDate && expiryDate < now) return 'EXPIRED';

    const latestByType = new Map<CustomerDocumentType, CustomerDocument>();
    for (const d of docs) {
      const prev = latestByType.get(d.type);
      if (!prev || d.createdAt > prev.createdAt) latestByType.set(d.type, d);
    }
    const relevant = Array.from(latestByType.values());
    if (relevant.length === 0) return 'NOT_SUBMITTED';

    if (relevant.some((d) => d.status === 'REJECTED')) return 'REJECTED';
    if (relevant.some((d) => d.status === 'EXPIRED')) return 'EXPIRED';
    if (relevant.every((d) => d.status === 'VERIFIED')) return 'VERIFIED';
    if (
      relevant.some((d) =>
        (['UPLOADED', 'PENDING_REVIEW'] as CustomerDocumentStatus[]).includes(
          d.status,
        ),
      )
    ) {
      return 'PENDING_REVIEW';
    }
    return 'NOT_SUBMITTED';
  }

  private async assertCustomer(orgId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId: orgId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }
}
