import { Injectable } from '@nestjs/common';
import type { LegalDocumentDeliveryEvidence, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  LEGAL_ACKNOWLEDGMENT_METHOD,
  LEGAL_DELIVERY_CHANNEL,
  LEGAL_DELIVERY_EVIDENCE_ERROR_CODE,
  LEGAL_DELIVERY_STATUS,
  LEGAL_DELIVERY_TERMINAL_STATUSES,
  type LegalAcknowledgmentMethod,
  type LegalDeliveryChannel,
  type LegalDeliveryStatus,
} from './legal-document-delivery-evidence.constants';
import { LegalDocumentDeliveryEvidenceError } from './legal-document-delivery-evidence.errors';
import type {
  LegalDocumentDeliveryEvidenceActor,
  LegalDocumentRecipientSnapshot,
  RecordLegalDocumentAcknowledgmentInput,
  RecordLegalDocumentPresentationInput,
  UpdateLegalDocumentDeliveryStatusInput,
} from './legal-document-delivery-evidence.types';
import { toLegalDocumentDeliveryEvidenceDto } from './dto/legal-document-delivery-evidence.dto';
import type { LegalDocumentDeliveryEvidenceDto } from './dto/legal-document-delivery-evidence.dto';
import { type DocumentType, isLegalDocumentType } from './documents.constants';

const ALLOWED_DELIVERY_TRANSITIONS: Record<LegalDeliveryStatus, LegalDeliveryStatus[]> = {
  [LEGAL_DELIVERY_STATUS.PENDING]: [
    LEGAL_DELIVERY_STATUS.PRESENTED,
    LEGAL_DELIVERY_STATUS.SENT,
    LEGAL_DELIVERY_STATUS.FAILED,
  ],
  [LEGAL_DELIVERY_STATUS.PRESENTED]: [
    LEGAL_DELIVERY_STATUS.SENT,
    LEGAL_DELIVERY_STATUS.DELIVERED,
    LEGAL_DELIVERY_STATUS.FAILED,
  ],
  [LEGAL_DELIVERY_STATUS.SENT]: [
    LEGAL_DELIVERY_STATUS.DELIVERED,
    LEGAL_DELIVERY_STATUS.FAILED,
    LEGAL_DELIVERY_STATUS.BOUNCED,
    LEGAL_DELIVERY_STATUS.OPENED,
  ],
  [LEGAL_DELIVERY_STATUS.OPENED]: [
    LEGAL_DELIVERY_STATUS.DELIVERED,
    LEGAL_DELIVERY_STATUS.FAILED,
    LEGAL_DELIVERY_STATUS.BOUNCED,
  ],
  [LEGAL_DELIVERY_STATUS.DELIVERED]: [],
  [LEGAL_DELIVERY_STATUS.FAILED]: [],
  [LEGAL_DELIVERY_STATUS.BOUNCED]: [],
};

@Injectable()
export class LegalDocumentDeliveryEvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async listForBooking(
    organizationId: string,
    bookingId: string,
  ): Promise<LegalDocumentDeliveryEvidenceDto[]> {
    await this.assertBookingScope(organizationId, bookingId);
    const rows = await this.prisma.legalDocumentDeliveryEvidence.findMany({
      where: { organizationId, bookingId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toLegalDocumentDeliveryEvidenceDto);
  }

  async getById(organizationId: string, evidenceId: string): Promise<LegalDocumentDeliveryEvidenceDto> {
    const row = await this.prisma.legalDocumentDeliveryEvidence.findFirst({
      where: { id: evidenceId, organizationId },
    });
    if (!row) {
      throw new LegalDocumentDeliveryEvidenceError(
        LEGAL_DELIVERY_EVIDENCE_ERROR_CODE.NOT_FOUND,
        `Delivery evidence ${evidenceId} not found`,
        { organizationId, evidenceId },
      );
    }
    return toLegalDocumentDeliveryEvidenceDto(row);
  }

  /**
   * Record that a legal text was presented to a customer.
   * Server timestamps only; actor from authenticated context.
   */
  async recordPresentation(
    input: RecordLegalDocumentPresentationInput,
    actor: LegalDocumentDeliveryEvidenceActor,
  ): Promise<LegalDocumentDeliveryEvidenceDto> {
    await this.assertBookingScope(input.organizationId, input.bookingId, input.customerId);
    const metadata = await this.resolvePresentationMetadata(input);

    if (input.requestId) {
      const existing = await this.prisma.legalDocumentDeliveryEvidence.findFirst({
        where: { organizationId: input.organizationId, requestId: input.requestId },
      });
      if (existing) {
        return toLegalDocumentDeliveryEvidenceDto(existing);
      }
    }

    this.assertRecipientSnapshot(input.recipientSnapshot, input.customerId);

    const presentedAt = new Date();
    const deliveryStatus = this.initialStatusForChannel(input.deliveryChannel);

    try {
      const row = await this.prisma.legalDocumentDeliveryEvidence.create({
        data: {
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          customerId: input.customerId,
          legalDocumentId: input.legalDocumentId,
          generatedDocumentId: input.generatedDocumentId,
          documentType: metadata.documentType,
          versionLabel: metadata.versionLabel,
          language: metadata.language,
          checksum: metadata.checksum,
          presentedAt,
          deliveryChannel: input.deliveryChannel,
          deliveryStatus,
          deliveredAt:
            deliveryStatus === LEGAL_DELIVERY_STATUS.DELIVERED ? presentedAt : null,
          actorUserId: actor.userId,
          recipientSnapshot: input.recipientSnapshot as unknown as Prisma.InputJsonValue,
          requestId: input.requestId ?? null,
          outboundEmailId: input.outboundEmailId ?? null,
        },
      });
      return toLegalDocumentDeliveryEvidenceDto(row);
    } catch (err) {
      if (this.isUniqueRequestViolation(err) && input.requestId) {
        const existing = await this.prisma.legalDocumentDeliveryEvidence.findFirst({
          where: { organizationId: input.organizationId, requestId: input.requestId },
        });
        if (existing) return toLegalDocumentDeliveryEvidenceDto(existing);
      }
      throw err;
    }
  }

  /**
   * Update email (or other async) delivery status. Only delivery fields may change.
   * Completed evidence events are immutable.
   */
  async updateDeliveryStatus(
    input: UpdateLegalDocumentDeliveryStatusInput,
    actor: LegalDocumentDeliveryEvidenceActor,
  ): Promise<LegalDocumentDeliveryEvidenceDto> {
    const row = await this.loadForMutation(input.organizationId, input.evidenceId);
    this.assertMutable(row);

    if (!this.canTransition(row.deliveryStatus as LegalDeliveryStatus, input.deliveryStatus)) {
      throw new LegalDocumentDeliveryEvidenceError(
        LEGAL_DELIVERY_EVIDENCE_ERROR_CODE.INVALID_TRANSITION,
        `Cannot transition delivery status from ${row.deliveryStatus} to ${input.deliveryStatus}`,
        {
          evidenceId: row.id,
          from: row.deliveryStatus,
          to: input.deliveryStatus,
        },
      );
    }

    const deliveredAt =
      input.deliveredAt ??
      (input.deliveryStatus === LEGAL_DELIVERY_STATUS.DELIVERED ? new Date() : row.deliveredAt);

    const updated = await this.prisma.legalDocumentDeliveryEvidence.update({
      where: { id: row.id },
      data: {
        deliveryStatus: input.deliveryStatus,
        deliveredAt,
        outboundEmailId: input.outboundEmailId ?? row.outboundEmailId,
        actorUserId: actor.userId ?? row.actorUserId,
      },
    });
    return toLegalDocumentDeliveryEvidenceDto(updated);
  }

  /**
   * Record customer acknowledgment of receipt — NOT consent grant.
   * Seals the evidence row (no further mutation).
   */
  async recordAcknowledgment(
    input: RecordLegalDocumentAcknowledgmentInput,
    actor: LegalDocumentDeliveryEvidenceActor,
  ): Promise<LegalDocumentDeliveryEvidenceDto> {
    const row = await this.loadForMutation(input.organizationId, input.evidenceId);
    if (row.acknowledgedAt) {
      return toLegalDocumentDeliveryEvidenceDto(row);
    }
    this.assertMutable(row);

    const updated = await this.prisma.legalDocumentDeliveryEvidence.update({
      where: { id: row.id },
      data: {
        acknowledgedAt: new Date(),
        acknowledgmentMethod: input.acknowledgmentMethod,
        signatureReference: input.signatureReference ?? null,
        actorUserId: actor.userId ?? row.actorUserId,
      },
    });
    return toLegalDocumentDeliveryEvidenceDto(updated);
  }

  /** Find evidence rows linked to an outbound email (for webhook-driven status updates). */
  async listByOutboundEmail(
    organizationId: string,
    outboundEmailId: string,
  ): Promise<LegalDocumentDeliveryEvidenceDto[]> {
    const rows = await this.prisma.legalDocumentDeliveryEvidence.findMany({
      where: { organizationId, outboundEmailId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toLegalDocumentDeliveryEvidenceDto);
  }

  /**
   * Propagate Resend/outbound email webhook events to linked delivery evidence rows.
   * Idempotent — terminal evidence rows and duplicate transitions are skipped.
   */
  async applyOutboundEmailWebhookUpdate(
    organizationId: string,
    outboundEmailId: string,
    eventType: string,
  ): Promise<number> {
    const mapped = this.mapOutboundEventToDeliveryStatus(eventType);
    if (!mapped) return 0;

    const rows = await this.prisma.legalDocumentDeliveryEvidence.findMany({
      where: { organizationId, outboundEmailId },
    });

    let updated = 0;
    for (const row of rows) {
      if (this.isImmutable(row)) continue;
      if (!this.canTransition(row.deliveryStatus as LegalDeliveryStatus, mapped)) continue;
      if (row.deliveryStatus === mapped) continue;
      try {
        await this.updateDeliveryStatus(
          {
            organizationId,
            evidenceId: row.id,
            deliveryStatus: mapped,
            outboundEmailId,
          },
          { userId: null },
        );
        updated += 1;
      } catch {
        // Skip immutable / invalid transition races
      }
    }
    return updated;
  }

  private mapOutboundEventToDeliveryStatus(
    eventType: string,
  ): LegalDeliveryStatus | null {
    switch (eventType) {
      case 'DELIVERED':
        return LEGAL_DELIVERY_STATUS.DELIVERED;
      case 'BOUNCED':
      case 'COMPLAINED':
        return LEGAL_DELIVERY_STATUS.BOUNCED;
      case 'OPENED':
        return LEGAL_DELIVERY_STATUS.OPENED;
      case 'FAILED':
        return LEGAL_DELIVERY_STATUS.FAILED;
      default:
        return null;
    }
  }

  isImmutable(evidence: Pick<LegalDocumentDeliveryEvidence, 'acknowledgedAt' | 'deliveryStatus'>): boolean {
    if (evidence.acknowledgedAt) return true;
    return LEGAL_DELIVERY_TERMINAL_STATUSES.has(evidence.deliveryStatus as LegalDeliveryStatus);
  }

  private initialStatusForChannel(channel: LegalDeliveryChannel): LegalDeliveryStatus {
    if (channel === LEGAL_DELIVERY_CHANNEL.EMAIL) {
      return LEGAL_DELIVERY_STATUS.SENT;
    }
    return LEGAL_DELIVERY_STATUS.PRESENTED;
  }

  private canTransition(from: LegalDeliveryStatus, to: LegalDeliveryStatus): boolean {
    if (from === to) return true;
    return ALLOWED_DELIVERY_TRANSITIONS[from]?.includes(to) ?? false;
  }

  private assertMutable(row: LegalDocumentDeliveryEvidence): void {
    if (this.isImmutable(row)) {
      throw new LegalDocumentDeliveryEvidenceError(
        LEGAL_DELIVERY_EVIDENCE_ERROR_CODE.IMMUTABLE,
        `Delivery evidence ${row.id} is immutable`,
        { evidenceId: row.id, deliveryStatus: row.deliveryStatus, acknowledgedAt: row.acknowledgedAt },
      );
    }
  }

  private async loadForMutation(
    organizationId: string,
    evidenceId: string,
  ): Promise<LegalDocumentDeliveryEvidence> {
    const row = await this.prisma.legalDocumentDeliveryEvidence.findFirst({
      where: { id: evidenceId, organizationId },
    });
    if (!row) {
      throw new LegalDocumentDeliveryEvidenceError(
        LEGAL_DELIVERY_EVIDENCE_ERROR_CODE.NOT_FOUND,
        `Delivery evidence ${evidenceId} not found`,
        { organizationId, evidenceId },
      );
    }
    return row;
  }

  private async assertBookingScope(
    organizationId: string,
    bookingId: string,
    customerId?: string,
  ): Promise<void> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: { id: true, customerId: true },
    });
    if (!booking) {
      throw new LegalDocumentDeliveryEvidenceError(
        LEGAL_DELIVERY_EVIDENCE_ERROR_CODE.TENANT_MISMATCH,
        `Booking ${bookingId} not found for organization`,
        { organizationId, bookingId },
      );
    }
    if (customerId && booking.customerId !== customerId) {
      throw new LegalDocumentDeliveryEvidenceError(
        LEGAL_DELIVERY_EVIDENCE_ERROR_CODE.TENANT_MISMATCH,
        `Customer ${customerId} does not match booking ${bookingId}`,
        { organizationId, bookingId, customerId },
      );
    }
  }

  private async resolvePresentationMetadata(
    input: Pick<
      RecordLegalDocumentPresentationInput,
      'organizationId' | 'bookingId' | 'legalDocumentId' | 'generatedDocumentId'
    >,
  ): Promise<{
    documentType: DocumentType;
    versionLabel: string;
    language: string;
    checksum: string | null;
  }> {
    const generated = await this.prisma.generatedDocument.findFirst({
      where: {
        id: input.generatedDocumentId,
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        legalDocumentId: input.legalDocumentId,
      },
      select: {
        id: true,
        documentType: true,
        checksum: true,
        legalVersionLabel: true,
      },
    });
    if (!generated) {
      throw new LegalDocumentDeliveryEvidenceError(
        LEGAL_DELIVERY_EVIDENCE_ERROR_CODE.TENANT_MISMATCH,
        'Generated document is not scoped to organization/booking/legal document',
        {
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          generatedDocumentId: input.generatedDocumentId,
          legalDocumentId: input.legalDocumentId,
        },
      );
    }

    const legalDoc = await this.prisma.organizationLegalDocument.findFirst({
      where: {
        id: input.legalDocumentId,
        organizationId: input.organizationId,
      },
      select: {
        id: true,
        documentType: true,
        versionLabel: true,
        language: true,
        checksum: true,
      },
    });
    if (!legalDoc) {
      throw new LegalDocumentDeliveryEvidenceError(
        LEGAL_DELIVERY_EVIDENCE_ERROR_CODE.TENANT_MISMATCH,
        'Legal document is not scoped to organization',
        {
          organizationId: input.organizationId,
          legalDocumentId: input.legalDocumentId,
        },
      );
    }

    if (generated.documentType !== legalDoc.documentType) {
      throw new LegalDocumentDeliveryEvidenceError(
        LEGAL_DELIVERY_EVIDENCE_ERROR_CODE.METADATA_MISMATCH,
        'Generated document type does not match linked legal document',
        {
          generatedDocumentId: input.generatedDocumentId,
          legalDocumentId: input.legalDocumentId,
          generatedDocumentType: generated.documentType,
          legalDocumentType: legalDoc.documentType,
        },
      );
    }

    if (!isLegalDocumentType(generated.documentType)) {
      throw new LegalDocumentDeliveryEvidenceError(
        LEGAL_DELIVERY_EVIDENCE_ERROR_CODE.METADATA_MISMATCH,
        `Document type ${generated.documentType} is not eligible for legal delivery evidence`,
        { documentType: generated.documentType },
      );
    }

    const versionLabel = (generated.legalVersionLabel ?? legalDoc.versionLabel).trim();
    if (!versionLabel) {
      throw new LegalDocumentDeliveryEvidenceError(
        LEGAL_DELIVERY_EVIDENCE_ERROR_CODE.MISSING_REQUIRED,
        'Legal document version label is required for delivery evidence',
        {
          generatedDocumentId: input.generatedDocumentId,
          legalDocumentId: input.legalDocumentId,
        },
      );
    }

    return {
      documentType: generated.documentType as DocumentType,
      versionLabel,
      language: legalDoc.language,
      checksum: generated.checksum ?? legalDoc.checksum ?? null,
    };
  }

  private assertRecipientSnapshot(snapshot: LegalDocumentRecipientSnapshot, customerId: string): void {
    if (!snapshot.customerId || snapshot.customerId !== customerId) {
      throw new LegalDocumentDeliveryEvidenceError(
        LEGAL_DELIVERY_EVIDENCE_ERROR_CODE.MISSING_REQUIRED,
        'recipientSnapshot.customerId must match customerId',
        { customerId, snapshotCustomerId: snapshot.customerId },
      );
    }
    const forbiddenKeys = ['documentContent', 'pdf', 'body', 'html', 'consentType', 'marketingConsent'];
    for (const key of forbiddenKeys) {
      if (key in (snapshot as unknown as Record<string, unknown>)) {
        throw new LegalDocumentDeliveryEvidenceError(
          LEGAL_DELIVERY_EVIDENCE_ERROR_CODE.MISSING_REQUIRED,
          `recipientSnapshot must not contain ${key}`,
        );
      }
    }
  }

  private isUniqueRequestViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    );
  }
}

export { LEGAL_ACKNOWLEDGMENT_METHOD };
