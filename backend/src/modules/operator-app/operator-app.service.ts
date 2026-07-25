import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream } from 'fs';
import { join, basename } from 'path';
import { ConfigService } from '@nestjs/config';
import { BookingsService } from '@modules/bookings/bookings.service';
import { CustomerDocumentsService } from '@modules/customers/customer-documents.service';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { PrismaService } from '@shared/database/prisma.service';
import { assertMembershipPermission } from '@shared/auth/permission.util';
import {
  buildOperatorBookingContext,
  mapCustomerDocumentStatusRows,
  mapOperatorCustomerSearchRow,
} from './operator-data.mapper';
import type {
  OperatorBookingContextDto,
  OperatorCustomerSearchItemDto,
  OperatorDocumentPreviewGrantDto,
  OperatorHandoverSessionResumeDto,
  OperatorProcess,
  OperatorVehicleResumeDto,
} from './operator-data.types';
import { OPERATOR_DOCUMENT_PERMISSION_REQUIREMENTS } from './operator-app-permission.constants';
import { OperatorDocumentAuditService } from './operator-document-audit.service';
import { OperatorDocumentPreviewService } from './operator-document-preview.service';
import { buildContentDispositionInline } from '@modules/documents/storage/document-storage-content-disposition.util';

@Injectable()
export class OperatorAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly customerDocuments: CustomerDocumentsService,
    private readonly generatedDocuments: GeneratedDocumentsService,
    private readonly preview: OperatorDocumentPreviewService,
    private readonly audit: OperatorDocumentAuditService,
    private readonly config: ConfigService,
  ) {}

  async getBookingContext(
    orgId: string,
    bookingId: string,
    process: OperatorProcess,
    actor: { userId: string; membershipRole?: string | null; platformRole?: string | null },
  ): Promise<OperatorBookingContextDto> {
    const detail = await this.bookings.findDetail(orgId, bookingId);
    if (!detail) {
      throw new NotFoundException('Booking not found');
    }

    const canViewFullDocuments = await this.hasDocumentViewFull(actor, orgId);

    const customerDocs = detail.customer.customerId
      ? await this.prisma.customerDocument.findMany({
          where: { organizationId: orgId, customerId: detail.customer.customerId },
          select: {
            id: true,
            type: true,
            status: true,
            createdAt: true,
            expiresAt: true,
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    return buildOperatorBookingContext(process, detail, {
      canViewFullDocuments,
      customerDocuments: mapCustomerDocumentStatusRows(customerDocs, canViewFullDocuments),
      canStartPickup: detail.core.status === 'CONFIRMED',
      canStartReturn: detail.core.status === 'ACTIVE',
    });
  }

  async getHandoverSessionResume(
    orgId: string,
    sessionId: string,
    actor: { userId: string; membershipRole?: string | null; platformRole?: string | null },
  ): Promise<OperatorHandoverSessionResumeDto> {
    await this.assertBookingsRead(actor, orgId);
    const session = await this.prisma.bookingHandoverSession.findFirst({
      where: { id: sessionId, organizationId: orgId },
      select: {
        id: true,
        bookingId: true,
        vehicleId: true,
        kind: true,
        status: true,
        expiresAt: true,
      },
    });
    if (!session) {
      throw new NotFoundException('Handover session not found');
    }

    const expired =
      session.expiresAt != null && session.expiresAt.getTime() <= Date.now();
    const terminal = ['COMPLETED', 'CANCELLED', 'SUPERSEDED'].includes(session.status);

    return {
      sessionId: session.id,
      bookingId: session.bookingId,
      vehicleId: session.vehicleId,
      kind: session.kind,
      lifecycleStatus: session.status,
      editable: !terminal && !expired,
      expired,
    };
  }

  async getVehicleResume(
    orgId: string,
    vehicleId: string,
    actor: { userId: string; membershipRole?: string | null; platformRole?: string | null },
  ): Promise<OperatorVehicleResumeDto> {
    await this.assertBookingsRead(actor, orgId);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: {
        id: true,
        make: true,
        model: true,
        licensePlate: true,
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    const displayName = [vehicle.make, vehicle.model].filter(Boolean).join(' ').trim() || 'Fahrzeug';
    return {
      vehicleId: vehicle.id,
      displayName,
      licensePlate: vehicle.licensePlate ?? '',
    };
  }

  async searchCustomers(
    orgId: string,
    query: string,
    limit: number,
    actor: { userId: string; membershipRole?: string | null; platformRole?: string | null },
  ): Promise<OperatorCustomerSearchItemDto[]> {
    await this.assertBookingsRead(actor, orgId);
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    const rows = await this.prisma.customer.findMany({
      where: {
        organizationId: orgId,
        archivedAt: null,
        OR: [
          { firstName: { contains: trimmed, mode: 'insensitive' } },
          { lastName: { contains: trimmed, mode: 'insensitive' } },
          { email: { contains: trimmed, mode: 'insensitive' } },
          { phone: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
      take: Math.min(limit, 20),
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        idVerificationStatus: true,
        licenseVerificationStatus: true,
      },
    });

    return rows.map((row) => mapOperatorCustomerSearchRow(row as Record<string, unknown>));
  }

  async getCustomerSummary(
    orgId: string,
    customerId: string,
    actor: { userId: string; membershipRole?: string | null; platformRole?: string | null },
  ): Promise<OperatorCustomerSearchItemDto> {
    await this.assertBookingsRead(actor, orgId);
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId: orgId, archivedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        idVerificationStatus: true,
        licenseVerificationStatus: true,
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return mapOperatorCustomerSearchRow(customer as Record<string, unknown>);
  }

  async grantCustomerDocumentPreview(
    orgId: string,
    customerId: string,
    documentId: string,
    process: OperatorProcess | null,
    actor: { userId: string; membershipRole?: string | null; platformRole?: string | null },
  ): Promise<OperatorDocumentPreviewGrantDto> {
    await this.assertDocumentViewFull(actor, orgId);
    const doc = await this.customerDocuments.getDocument(orgId, customerId, documentId);

    await this.audit.logSensitiveDocumentView({
      organizationId: orgId,
      userId: actor.userId,
      kind: 'CUSTOMER_ID_DOCUMENT',
      customerId,
      documentId,
      documentType: doc.type,
      process,
    });

    const { token, expiresAt } = this.preview.issueCustomerDocumentPreviewToken({
      organizationId: orgId,
      customerId,
      documentId,
      userId: actor.userId,
    });

    return {
      previewPath: `/organizations/${orgId}/operator/preview/${token}`,
      expiresAt: expiresAt.toISOString(),
      audited: true,
    };
  }

  async grantBookingDocumentPreview(
    orgId: string,
    bookingId: string,
    documentId: string,
    process: OperatorProcess | null,
    actor: { userId: string; membershipRole?: string | null; platformRole?: string | null },
  ): Promise<OperatorDocumentPreviewGrantDto> {
    await this.assertDocumentViewFull(actor, orgId);
    const generated = await this.generatedDocuments.getById(orgId, documentId);
    if (generated.bookingId !== bookingId) {
      throw new ForbiddenException('Document does not belong to booking');
    }

    await this.audit.logSensitiveDocumentView({
      organizationId: orgId,
      userId: actor.userId,
      kind: 'GENERATED_BOOKING_DOCUMENT',
      bookingId,
      documentId,
      documentType: generated.documentType,
      process,
    });

    const { token, expiresAt } = this.preview.issueGeneratedDocumentPreviewToken({
      organizationId: orgId,
      bookingId,
      documentId,
      userId: actor.userId,
    });

    return {
      previewPath: `/organizations/${orgId}/operator/preview/${token}`,
      expiresAt: expiresAt.toISOString(),
      audited: true,
    };
  }

  async streamPreview(
    orgId: string,
    token: string,
  ): Promise<{ stream: StreamableFile; mimeType: string; fileName: string }> {
    const claims = this.preview.verifyToken(token);
    if (claims.organizationId !== orgId) {
      throw new ForbiddenException('Preview scope mismatch');
    }
    if (claims.kind === 'customer') {
      const doc = await this.customerDocuments.getDocument(
        orgId,
        claims.customerId,
        claims.documentId,
      );
      const stream = await this.openCustomerDocumentStream(doc.fileKey);
      return {
        stream: new StreamableFile(stream),
        mimeType: doc.mimeType ?? 'application/octet-stream',
        fileName: doc.originalFileName ?? 'document',
      };
    }
    const dl = await this.generatedDocuments.getDownload(orgId, claims.documentId);
    return {
      stream: new StreamableFile(dl.stream),
      mimeType: dl.mimeType,
      fileName: dl.fileName,
    };
  }

  private async openCustomerDocumentStream(fileKey: string) {
    if (!fileKey.startsWith('/uploads/')) {
      throw new NotFoundException('Document storage path unavailable');
    }
    const rel = fileKey.replace(/^\/uploads\//, '');
    const safe = rel.split('/').filter(Boolean).map((s) => basename(s)).join('/');
    const uploadsDir = this.config.get<string>('storage.uploadsDir', 'uploads');
    const abs = join(process.cwd(), uploadsDir, safe);
    return createReadStream(abs);
  }

  private async hasDocumentViewFull(
    actor: { userId: string; membershipRole?: string | null; platformRole?: string | null },
    orgId: string,
  ): Promise<boolean> {
    try {
      await this.assertDocumentViewFull(actor, orgId);
      return true;
    } catch {
      return false;
    }
  }

  private async assertDocumentViewFull(
    actor: { userId: string; membershipRole?: string | null; platformRole?: string | null },
    orgId: string,
  ): Promise<void> {
    const req = OPERATOR_DOCUMENT_PERMISSION_REQUIREMENTS['operator.documents.view_full'];
    await assertMembershipPermission(
      this.prisma,
      {
        id: actor.userId,
        platformRole: actor.platformRole ?? undefined,
        membershipRole: actor.membershipRole ?? undefined,
        organizationId: orgId,
      },
      orgId,
      req.module,
      req.level,
    );
  }

  private async assertBookingsRead(
    actor: { userId: string; membershipRole?: string | null; platformRole?: string | null },
    orgId: string,
  ): Promise<void> {
    const req = OPERATOR_DOCUMENT_PERMISSION_REQUIREMENTS['operator.documents.view_status'];
    await assertMembershipPermission(
      this.prisma,
      {
        id: actor.userId,
        platformRole: actor.platformRole ?? undefined,
        membershipRole: actor.membershipRole ?? undefined,
        organizationId: orgId,
      },
      orgId,
      req.module,
      req.level,
    );
  }
}
