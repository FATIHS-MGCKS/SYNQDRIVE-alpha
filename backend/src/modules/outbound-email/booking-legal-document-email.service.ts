import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OutboundEmailStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { cumulativeRequiredDocumentTypes } from '@modules/documents/booking-document-completeness.service';
import {
  bundlePointerValue,
  canonicalBundleLegalSlotType,
} from '@modules/documents/booking-document-bundle-pointer.mapping';
import {
  DOCUMENT_ORIGIN,
  DOCUMENT_TYPE,
  isEmailSendableDocumentStatus,
  type DocumentType,
} from '@modules/documents/documents.constants';
import { LegalDocumentDeliveryEvidenceService } from '@modules/documents/legal-document-delivery-evidence.service';
import {
  LEGAL_DELIVERY_CHANNEL,
} from '@modules/documents/legal-document-delivery-evidence.constants';
import { BookingDocumentEmailService, type SendBookingDocumentsEmailInput } from './booking-document-email.service';
import {
  buildLegalDeliveryEvidenceRequestId,
  buildLegalDocumentEmailSendIdempotencyKey,
} from './legal-document-email-send.contract';

export interface SendFrozenBookingDocumentsEmailInput
  extends Omit<SendBookingDocumentsEmailInput, 'documentIds'> {
  /** Optional client-supplied idempotency token (e.g. UI button dedup). */
  clientRequestId?: string | null;
  /** When set, only these frozen bundle documents are sent (must match bundle pointers for legal slots). */
  documentIds?: string[];
  /** When true (default), include all cumulative required frozen documents for the booking phase. */
  includeAllRequired?: boolean;
}

@Injectable()
export class BookingLegalDocumentEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingEmail: BookingDocumentEmailService,
    private readonly deliveryEvidence: LegalDocumentDeliveryEvidenceService,
  ) {}

  async resolveFrozenDocumentIds(
    organizationId: string,
    bookingId: string,
    requestedIds?: string[],
  ): Promise<string[]> {
    const { frozenByType } = await this.loadFrozenBundleDocuments(organizationId, bookingId);
    const frozenIds = [...frozenByType.values()].map((d) => d.id);

    if (!requestedIds || requestedIds.length === 0) {
      return frozenIds;
    }

    const requested = [...new Set(requestedIds)];
    for (const docId of requested) {
      const doc = await this.prisma.generatedDocument.findFirst({
        where: { id: docId, organizationId, bookingId },
        select: { id: true, documentType: true },
      });
      if (!doc) {
        throw new NotFoundException(`Document ${docId} not found for booking`);
      }
      const legalSlot = canonicalBundleLegalSlotType(doc.documentType as DocumentType);
      if (legalSlot) {
        const frozen = frozenByType.get(legalSlot);
        if (!frozen || frozen.id !== docId) {
          throw new ConflictException({
            code: 'LEGAL_EMAIL_FROZEN_POINTER_MISMATCH',
            message: `Document ${docId} is not the frozen bundle pointer for ${legalSlot}`,
            documentType: legalSlot,
            frozenDocumentId: frozen?.id ?? null,
          });
        }
      }
    }

    return requested;
  }

  async sendFrozenBookingDocuments(
    organizationId: string,
    bookingId: string,
    userId: string | null,
    input: SendFrozenBookingDocumentsEmailInput,
  ) {
    const includeAll = input.includeAllRequired !== false;
    const documentIds = includeAll
      ? await this.resolveFrozenDocumentIds(organizationId, bookingId)
      : await this.resolveFrozenDocumentIds(organizationId, bookingId, input.documentIds);

    if (documentIds.length === 0) {
      throw new BadRequestException({
        code: 'LEGAL_EMAIL_NO_FROZEN_DOCUMENTS',
        message: 'No frozen booking documents available to send',
      });
    }

    const sendIdempotencyKey = buildLegalDocumentEmailSendIdempotencyKey({
      organizationId,
      bookingId,
      documentIds,
      toEmail: input.toEmail,
      clientRequestId: input.clientRequestId,
    });

    const existing = await this.prisma.outboundEmail.findFirst({
      where: {
        organizationId,
        bookingId,
        sendIdempotencyKey,
        status: {
          in: [
            OutboundEmailStatus.QUEUED,
            OutboundEmailStatus.SENDING,
            OutboundEmailStatus.SENT,
            OutboundEmailStatus.SENT_SIMULATED,
          ],
        },
      },
      include: { attachments: true, events: { orderBy: { occurredAt: 'asc' } } },
    });
    if (existing) {
      return {
        deduplicated: true as const,
        email: this.bookingEmail.toOutboundDto(existing),
      };
    }

    const result = await this.bookingEmail.sendBookingDocuments(
      organizationId,
      bookingId,
      userId,
      {
        toEmail: input.toEmail,
        ccEmails: input.ccEmails,
        bccEmails: input.bccEmails,
        subject: input.subject,
        bodyText: input.bodyText,
        bodyHtml: input.bodyHtml,
        documentIds,
        sendIdempotencyKey,
        useFrozenAttachmentsOnly: true,
      },
    );

    await this.recordLegalDeliveryEvidenceForSend({
      organizationId,
      bookingId,
      outboundEmailId: result.id,
      documentIds,
      toEmail: input.toEmail,
      actorUserId: userId,
    });

    return { deduplicated: false as const, email: result };
  }

  async retryFailedSend(
    organizationId: string,
    bookingId: string,
    outboundEmailId: string,
    userId: string | null,
  ) {
    const failed = await this.prisma.outboundEmail.findFirst({
      where: {
        id: outboundEmailId,
        organizationId,
        bookingId,
        status: OutboundEmailStatus.FAILED,
      },
      include: { attachments: true },
    });
    if (!failed) {
      throw new NotFoundException('Failed outbound email not found for retry');
    }

    const documentIds = failed.attachments
      .map((a) => a.generatedDocumentId)
      .filter((id): id is string => !!id);

    const retryKey = `${failed.sendIdempotencyKey ?? `retry:${failed.id}`}:retry:${Date.now()}`;

    const result = await this.bookingEmail.sendBookingDocuments(
      organizationId,
      bookingId,
      userId,
      {
        toEmail: failed.toEmail,
        ccEmails: failed.ccEmails,
        bccEmails: failed.bccEmails,
        subject: failed.subject,
        bodyText: failed.bodyText ?? undefined,
        bodyHtml: failed.bodyHtml ?? undefined,
        documentIds,
        sendIdempotencyKey: retryKey,
        useFrozenAttachmentsOnly: true,
      },
    );

    await this.recordLegalDeliveryEvidenceForSend({
      organizationId,
      bookingId,
      outboundEmailId: result.id,
      documentIds,
      toEmail: failed.toEmail,
      actorUserId: userId,
    });

    return result;
  }

  /**
   * Auto-send frozen bundle documents on booking confirm (best-effort).
   */
  async maybeAutoSendFrozenBookingDocuments(
    organizationId: string,
    bookingId: string,
    userId: string | null,
  ) {
    try {
      const settings = await this.prisma.orgEmailSettings.findUnique({
        where: { organizationId },
      });
      if (!settings?.autoSendBookingDocumentsOnConfirm) {
        return { sent: false as const, reason: 'DISABLED' as const };
      }

      const booking = await this.prisma.booking.findFirst({
        where: { id: bookingId, organizationId },
        include: { customer: true },
      });
      if (!booking) return { sent: false as const, reason: 'BOOKING_NOT_FOUND' as const };

      const toEmail = booking.customer?.email?.trim();
      if (!toEmail) return { sent: false as const, reason: 'NO_CUSTOMER_EMAIL' as const };

      const documentIds = await this.resolveFrozenDocumentIds(organizationId, bookingId);
      if (documentIds.length === 0) {
        return { sent: false as const, reason: 'NO_SENDABLE_DOCUMENTS' as const };
      }

      const bookingNumber = `BK-${booking.id.slice(-6).toUpperCase()}`;
      const period = `${booking.startDate.toLocaleDateString('de-DE')} – ${booking.endDate.toLocaleDateString('de-DE')}`;
      const customerName =
        [booking.customer?.firstName, booking.customer?.lastName].filter(Boolean).join(' ').trim() ||
        booking.customer?.company?.trim() ||
        'Damen und Herren';

      const result = await this.sendFrozenBookingDocuments(organizationId, bookingId, userId, {
        toEmail,
        subject: `Ihre Buchung ${bookingNumber} am ${period}`,
        bodyHtml: `<p>Sehr geehrte/r ${customerName},</p><p>Im Anhang finden Sie Ihre Buchungsunterlagen.</p>`,
        includeAllRequired: true,
        clientRequestId: `auto-confirm:${bookingId}`,
      });

      return { sent: true as const, email: result.email, deduplicated: result.deduplicated };
    } catch (err) {
      return {
        sent: false as const,
        reason: 'FAILED' as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async loadFrozenBundleDocuments(organizationId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: {
        id: true,
        status: true,
        customerId: true,
        customer: { select: { email: true, firstName: true, lastName: true, company: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const bundle = await this.prisma.bookingDocumentBundle.findUnique({
      where: { bookingId },
    });
    if (!bundle || bundle.organizationId !== organizationId) {
      throw new BadRequestException({
        code: 'LEGAL_EMAIL_BUNDLE_MISSING',
        message: 'Booking document bundle not found',
      });
    }

    const requiredTypes = cumulativeRequiredDocumentTypes(booking.status);
    const frozenByType = new Map<DocumentType, { id: string; documentType: string }>();

    for (const documentType of requiredTypes) {
      const pointerId = bundlePointerValue(bundle, documentType);
      if (!pointerId) continue;

      const doc = await this.prisma.generatedDocument.findFirst({
        where: {
          id: pointerId,
          organizationId,
          bookingId,
          status: { not: 'VOID' },
        },
        select: {
          id: true,
          documentType: true,
          status: true,
          origin: true,
          legalDocumentId: true,
          legalVersionLabel: true,
          checksum: true,
          objectKey: true,
          snapshot: true,
        },
      });
      if (!doc || !isEmailSendableDocumentStatus(doc.status)) continue;

      const slotType = canonicalBundleLegalSlotType(documentType) ?? documentType;
      frozenByType.set(slotType, { id: doc.id, documentType: doc.documentType });
    }

    return { booking, bundle, frozenByType, requiredTypes };
  }

  private async recordLegalDeliveryEvidenceForSend(params: {
    organizationId: string;
    bookingId: string;
    outboundEmailId: string;
    documentIds: string[];
    toEmail: string;
    actorUserId: string | null;
  }) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: params.bookingId, organizationId: params.organizationId },
      select: {
        customerId: true,
        customer: {
          select: { email: true, firstName: true, lastName: true, company: true },
        },
      },
    });
    if (!booking) return;

    const docs = await this.prisma.generatedDocument.findMany({
      where: {
        id: { in: params.documentIds },
        organizationId: params.organizationId,
        bookingId: params.bookingId,
        origin: DOCUMENT_ORIGIN.STATIC_LEGAL,
      },
      select: {
        id: true,
        documentType: true,
        legalDocumentId: true,
        legalVersionLabel: true,
        checksum: true,
        snapshot: true,
      },
    });

    const displayName =
      [booking.customer?.firstName, booking.customer?.lastName].filter(Boolean).join(' ').trim() ||
      booking.customer?.company?.trim() ||
      null;

    for (const doc of docs) {
      if (!doc.legalDocumentId) continue;
      const slot = canonicalBundleLegalSlotType(doc.documentType as DocumentType);
      if (!slot) continue;
      const language =
        typeof doc.snapshot === 'object' &&
        doc.snapshot !== null &&
        'language' in (doc.snapshot as Record<string, unknown>)
          ? String((doc.snapshot as Record<string, unknown>).language ?? 'de')
          : 'de';
      await this.deliveryEvidence.recordPresentation(
        {
          organizationId: params.organizationId,
          bookingId: params.bookingId,
          customerId: booking.customerId,
          legalDocumentId: doc.legalDocumentId,
          generatedDocumentId: doc.id,
          deliveryChannel: LEGAL_DELIVERY_CHANNEL.EMAIL,
          outboundEmailId: params.outboundEmailId,
          requestId: buildLegalDeliveryEvidenceRequestId(params.outboundEmailId, doc.documentType),
          recipientSnapshot: {
            customerId: booking.customerId,
            displayName,
            email: params.toEmail,
            language,
          },
        },
        { userId: params.actorUserId },
      );
    }
  }
}
