import { Injectable } from '@nestjs/common';
import type { BookingLegalAcceptance, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BOOKING_LEGAL_ACCEPTANCE_ERROR_CODE,
  BOOKING_LEGAL_ACCEPTANCE_RETENTION_CLASS,
  DEFAULT_LEGAL_BASIS_BY_ACCEPTANCE_TYPE,
  FORBIDDEN_METADATA_KEYS,
  REVOCABLE_ACCEPTANCE_TYPES,
} from './booking-legal-acceptance.constants';
import { BookingLegalAcceptanceError } from './booking-legal-acceptance.errors';
import type {
  RecordBookingLegalAcceptanceInput,
  ResolvedLegalDocumentRef,
  RevokeBookingLegalConsentInput,
} from './booking-legal-acceptance.types';
import { toBookingLegalAcceptanceDto } from './dto/booking-legal-acceptance.dto';
import type { BookingLegalAcceptanceDto } from './dto/booking-legal-acceptance.dto';
import { DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import { BookingLegalDocumentSnapshotService } from '@modules/documents/legal-document-snapshot/booking-legal-document-snapshot.service';

type Tx = Prisma.TransactionClient;

@Injectable()
export class BookingLegalAcceptanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legalDocumentSnapshots: BookingLegalDocumentSnapshotService,
  ) {}

  async listForBooking(
    organizationId: string,
    bookingId: string,
  ): Promise<BookingLegalAcceptanceDto[]> {
    await this.assertBookingScope(organizationId, bookingId);
    const rows = await this.prisma.bookingLegalAcceptance.findMany({
      where: { organizationId, bookingId },
      orderBy: [{ acceptedAt: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toBookingLegalAcceptanceDto);
  }

  async listForCustomer(
    organizationId: string,
    customerId: string,
  ): Promise<BookingLegalAcceptanceDto[]> {
    const rows = await this.prisma.bookingLegalAcceptance.findMany({
      where: { organizationId, customerId },
      orderBy: [{ acceptedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toBookingLegalAcceptanceDto);
  }

  async getById(
    organizationId: string,
    acceptanceId: string,
  ): Promise<BookingLegalAcceptanceDto> {
    const row = await this.prisma.bookingLegalAcceptance.findFirst({
      where: { id: acceptanceId, organizationId },
    });
    if (!row) {
      throw new BookingLegalAcceptanceError(
        BOOKING_LEGAL_ACCEPTANCE_ERROR_CODE.NOT_FOUND,
        `Legal acceptance ${acceptanceId} not found`,
        { organizationId, acceptanceId },
      );
    }
    return toBookingLegalAcceptanceDto(row);
  }

  async recordAcceptance(
    input: RecordBookingLegalAcceptanceInput,
    tx?: Tx,
  ): Promise<BookingLegalAcceptanceDto> {
    await this.assertBookingScope(
      input.organizationId,
      input.bookingId,
      input.customerId,
      tx,
    );
    this.assertDocumentHash(input.immutableDocumentHash);
    this.assertMetadata(input.metadata);

    if (input.requestId) {
      const existing = await this.findByRequestId(
        input.organizationId,
        input.requestId,
        tx,
      );
      if (existing) {
        return toBookingLegalAcceptanceDto(existing);
      }
    }

    const eventKind = input.eventKind ?? 'ACCEPTANCE';
    if (eventKind === 'REVOCATION') {
      this.assertRevocationPayload(input);
    }

    const legalBasis =
      input.legalBasis ??
      DEFAULT_LEGAL_BASIS_BY_ACCEPTANCE_TYPE[input.acceptanceType];

    const acceptedAt = input.acceptedAt ?? new Date();
    const data: Prisma.BookingLegalAcceptanceCreateInput = {
      organization: { connect: { id: input.organizationId } },
      booking: { connect: { id: input.bookingId } },
      customer: { connect: { id: input.customerId } },
      actorType: input.actor.actorType,
      actorId: input.actor.actorId ?? null,
      eventKind,
      acceptanceType: input.acceptanceType,
      documentType: input.documentType,
      documentVersion: input.documentVersion,
      immutableDocumentHash: input.immutableDocumentHash,
      language: input.language,
      legalBasis,
      purpose: input.purpose ?? null,
      acceptedAt,
      source: input.source,
      revokedAt: input.revokedAt ?? null,
      requestId: input.requestId ?? null,
      metadata: input.metadata ?? undefined,
      retentionClass: BOOKING_LEGAL_ACCEPTANCE_RETENTION_CLASS,
      ...(input.relatedAcceptanceId
        ? { relatedAcceptance: { connect: { id: input.relatedAcceptanceId } } }
        : {}),
      ...(input.legalDocumentId
        ? { legalDocument: { connect: { id: input.legalDocumentId } } }
        : {}),
      ...(input.generatedDocumentId
        ? { generatedDocument: { connect: { id: input.generatedDocumentId } } }
        : {}),
      ...(input.legalDocumentSnapshotId
        ? { legalDocumentSnapshot: { connect: { id: input.legalDocumentSnapshotId } } }
        : {}),
      ...(input.handoverProtocolId
        ? { handoverProtocol: { connect: { id: input.handoverProtocolId } } }
        : {}),
    };

    const client = tx ?? this.prisma;
    try {
      const row = await client.bookingLegalAcceptance.create({ data });
      return toBookingLegalAcceptanceDto(row);
    } catch (err) {
      if (
        input.requestId &&
        err instanceof Error &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002'
      ) {
        const existing = await this.findByRequestId(
          input.organizationId,
          input.requestId,
          tx,
        );
        if (existing) {
          return toBookingLegalAcceptanceDto(existing);
        }
      }
      throw err;
    }
  }

  recordAcceptanceInTransaction(tx: Tx, input: RecordBookingLegalAcceptanceInput) {
    return this.recordAcceptance(input, tx);
  }

  async revokeConsent(
    input: RevokeBookingLegalConsentInput,
  ): Promise<BookingLegalAcceptanceDto> {
    await this.assertBookingScope(
      input.organizationId,
      input.bookingId,
      input.customerId,
    );

    if (input.requestId) {
      const existing = await this.findByRequestId(
        input.organizationId,
        input.requestId,
      );
      if (existing) {
        return toBookingLegalAcceptanceDto(existing);
      }
    }

    const original = await this.prisma.bookingLegalAcceptance.findFirst({
      where: {
        id: input.acceptanceId,
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        customerId: input.customerId,
        eventKind: 'ACCEPTANCE',
      },
    });
    if (!original) {
      throw new BookingLegalAcceptanceError(
        BOOKING_LEGAL_ACCEPTANCE_ERROR_CODE.NOT_FOUND,
        `Acceptance ${input.acceptanceId} not found for revocation`,
        { acceptanceId: input.acceptanceId },
      );
    }
    if (!REVOCABLE_ACCEPTANCE_TYPES.has(original.acceptanceType)) {
      throw new BookingLegalAcceptanceError(
        BOOKING_LEGAL_ACCEPTANCE_ERROR_CODE.INVALID_REVOCATION,
        `Acceptance type ${original.acceptanceType} is not revocable`,
        { acceptanceType: original.acceptanceType },
      );
    }

    const revokedAt = new Date();
    return this.recordAcceptance({
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      customerId: input.customerId,
      actor: input.actor,
      eventKind: 'REVOCATION',
      acceptanceType: original.acceptanceType,
      documentType: original.documentType,
      documentVersion: original.documentVersion,
      immutableDocumentHash: original.immutableDocumentHash,
      language: original.language,
      legalBasis: original.legalBasis,
      purpose: original.purpose,
      acceptedAt: revokedAt,
      source: input.source,
      revokedAt,
      relatedAcceptanceId: original.id,
      legalDocumentId: original.legalDocumentId,
      generatedDocumentId: original.generatedDocumentId,
      requestId: input.requestId ?? null,
      metadata: input.metadata ?? null,
    });
  }

  /**
   * Resolve frozen generated-document metadata for checkout legal pointers.
   * Returns null when the pointer or checksum is missing — no synthetic acceptance.
   */
  async resolveGeneratedDocumentRef(
    organizationId: string,
    generatedDocumentId: string | null | undefined,
  ): Promise<ResolvedLegalDocumentRef | null> {
    if (!generatedDocumentId) return null;
    const doc = await this.prisma.generatedDocument.findFirst({
      where: { id: generatedDocumentId, organizationId },
      select: {
        id: true,
        documentType: true,
        legalVersionLabel: true,
        templateVersion: true,
        checksum: true,
        legalDocumentId: true,
        metadata: true,
      },
    });
    if (!doc?.checksum) return null;

    const language = this.extractLanguage(doc.metadata);
    return {
      documentType: doc.documentType,
      documentVersion: doc.legalVersionLabel ?? doc.templateVersion ?? 'unknown',
      immutableDocumentHash: doc.checksum,
      language,
      legalDocumentId: doc.legalDocumentId,
      generatedDocumentId: doc.id,
    };
  }

  async recordCheckoutAcceptancesFromFlags(input: {
    organizationId: string;
    bookingId: string;
    customerId: string;
    actorUserId?: string | null;
    agbAccepted?: boolean;
    privacyAccepted?: boolean;
    marketingConsent?: boolean;
    otherConsent?: { purpose: string; documentType: string; generatedDocumentId?: string };
  }): Promise<BookingLegalAcceptanceDto[]> {
    const snapshots = await this.legalDocumentSnapshots.ensureCheckoutSnapshots(
      input.organizationId,
      input.bookingId,
      { actorUserId: input.actorUserId ?? null },
    );
    const snapshotByType = new Map(snapshots.map((s) => [s.documentType, s]));

    const results: BookingLegalAcceptanceDto[] = [];
    const actor = {
      actorType: 'CUSTOMER' as const,
      actorId: input.customerId,
    };

    if (input.agbAccepted) {
      const snapshot = snapshotByType.get(DOCUMENT_TYPE.TERMS_AND_CONDITIONS);
      if (snapshot && snapshot.integrityStatus !== 'CHECKSUM_MISMATCH') {
        results.push(
          await this.recordAcceptance({
            organizationId: input.organizationId,
            bookingId: input.bookingId,
            customerId: input.customerId,
            actor,
            acceptanceType: 'TERMS_CONTRACT_ACCEPTANCE',
            documentType: snapshot.documentType,
            documentVersion: snapshot.renderedVersion,
            immutableDocumentHash: snapshot.contentHash,
            language: snapshot.language,
            purpose: 'Rental contract formation',
            source: 'checkout_wizard',
            legalDocumentId: snapshot.legalDocumentId,
            generatedDocumentId: snapshot.generatedDocumentId,
            legalDocumentSnapshotId: snapshot.id,
            requestId: `checkout:${input.bookingId}:terms:${snapshot.contentHash}`,
            metadata: {
              hashAlgorithm: snapshot.hashAlgorithm,
              templateVersion: snapshot.templateVersion,
              ...(input.actorUserId ? { recordedByUserId: input.actorUserId } : {}),
            },
          }),
        );
      }
    }

    if (input.privacyAccepted) {
      const snapshot = snapshotByType.get(DOCUMENT_TYPE.PRIVACY_POLICY);
      if (snapshot && snapshot.integrityStatus !== 'CHECKSUM_MISMATCH') {
        results.push(
          await this.recordAcceptance({
            organizationId: input.organizationId,
            bookingId: input.bookingId,
            customerId: input.customerId,
            actor,
            acceptanceType: 'PRIVACY_NOTICE_ACKNOWLEDGMENT',
            documentType: snapshot.documentType,
            documentVersion: snapshot.renderedVersion,
            immutableDocumentHash: snapshot.contentHash,
            language: snapshot.language,
            purpose: 'Privacy notice acknowledgment (Art. 13/14 GDPR)',
            source: 'checkout_wizard',
            legalDocumentId: snapshot.legalDocumentId,
            generatedDocumentId: snapshot.generatedDocumentId,
            legalDocumentSnapshotId: snapshot.id,
            requestId: `checkout:${input.bookingId}:privacy_notice:${snapshot.contentHash}`,
            metadata: {
              hashAlgorithm: snapshot.hashAlgorithm,
              templateVersion: snapshot.templateVersion,
              ...(input.actorUserId ? { recordedByUserId: input.actorUserId } : {}),
            },
          }),
        );
      }
    }

    if (input.marketingConsent) {
      results.push(
        await this.recordAcceptance({
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          customerId: input.customerId,
          actor,
          acceptanceType: 'MARKETING_CONSENT',
          documentType: 'MARKETING_PREFERENCE',
          documentVersion: 'checkout-v1',
          immutableDocumentHash: `marketing:${input.bookingId}:${input.customerId}`,
          language: 'de',
          purpose: 'Marketing communications',
          source: 'checkout_wizard',
          requestId: `checkout:${input.bookingId}:marketing`,
          metadata: input.actorUserId
            ? { recordedByUserId: input.actorUserId }
            : undefined,
        }),
      );
    }

    if (input.otherConsent?.purpose) {
      const ref = input.otherConsent.generatedDocumentId
        ? await this.resolveGeneratedDocumentRef(
            input.organizationId,
            input.otherConsent.generatedDocumentId,
          )
        : null;
      if (ref || input.otherConsent.documentType) {
        results.push(
          await this.recordAcceptance({
            organizationId: input.organizationId,
            bookingId: input.bookingId,
            customerId: input.customerId,
            actor,
            acceptanceType: 'OTHER_CONSENT',
            documentType: ref?.documentType ?? input.otherConsent.documentType,
            documentVersion: ref?.documentVersion ?? 'checkout-v1',
            immutableDocumentHash:
              ref?.immutableDocumentHash ??
              `other:${input.bookingId}:${input.otherConsent.documentType}`,
            language: ref?.language ?? 'de',
            purpose: input.otherConsent.purpose,
            source: 'checkout_wizard',
            legalDocumentId: ref?.legalDocumentId ?? null,
            generatedDocumentId: ref?.generatedDocumentId ?? null,
            requestId: `checkout:${input.bookingId}:other:${input.otherConsent.documentType}`,
            metadata: input.actorUserId
              ? { recordedByUserId: input.actorUserId }
              : undefined,
          }),
        );
      }
    }

    return results;
  }

  async recordHandoverSignatures(input: {
    organizationId: string;
    bookingId: string;
    customerId: string;
    handoverProtocolId: string;
    kind: 'PICKUP' | 'RETURN';
    customerSignatureName?: string | null;
    staffSignatureName?: string | null;
    actorUserId?: string | null;
  }): Promise<BookingLegalAcceptanceDto[]> {
    if (!input.customerSignatureName && !input.staffSignatureName) {
      return [];
    }

    const protocolDoc = await this.prisma.generatedDocument.findFirst({
      where: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        handoverProtocolId: input.handoverProtocolId,
      },
      select: {
        id: true,
        documentType: true,
        legalVersionLabel: true,
        templateVersion: true,
        checksum: true,
        legalDocumentId: true,
        metadata: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const acceptanceType =
      input.kind === 'PICKUP' ? 'HANDOVER_SIGNATURE' : 'RETURN_SIGNATURE';
    const documentType =
      input.kind === 'PICKUP'
        ? DOCUMENT_TYPE.HANDOVER_PICKUP
        : DOCUMENT_TYPE.HANDOVER_RETURN;

    const results: BookingLegalAcceptanceDto[] = [];
    let snapshotId: string | null = null;
    let snapshotHash = protocolDoc?.checksum ?? `handover:${input.handoverProtocolId}:${acceptanceType}`;
    let snapshotVersion =
      protocolDoc?.legalVersionLabel ?? protocolDoc?.templateVersion ?? 'handover-v1';
    let snapshotLanguage = this.extractLanguage(protocolDoc?.metadata);

    if (protocolDoc?.checksum) {
      const snapshot = await this.legalDocumentSnapshots.createFromGeneratedDocument({
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        generatedDocumentId: protocolDoc.id,
        presentationContext: 'HANDOVER',
        actorUserId: input.actorUserId ?? null,
      });
      snapshotId = snapshot.id;
      snapshotHash = snapshot.contentHash;
      snapshotVersion = snapshot.renderedVersion;
      snapshotLanguage = snapshot.language;
    }

    if (input.customerSignatureName) {
      results.push(
        await this.recordAcceptance({
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          customerId: input.customerId,
          actor: { actorType: 'CUSTOMER', actorId: input.customerId },
          acceptanceType,
          documentType: protocolDoc?.documentType ?? documentType,
          documentVersion: snapshotVersion,
          immutableDocumentHash: snapshotHash,
          language: snapshotLanguage,
          purpose: `${input.kind} customer signature`,
          source: 'handover_flow',
          handoverProtocolId: input.handoverProtocolId,
          generatedDocumentId: protocolDoc?.id ?? null,
          legalDocumentId: protocolDoc?.legalDocumentId ?? null,
          legalDocumentSnapshotId: snapshotId,
          requestId: `handover:${input.handoverProtocolId}:customer:${acceptanceType}`,
          metadata: {
            signatureRole: 'customer',
            signatureName: input.customerSignatureName,
            ...(input.actorUserId ? { recordedByUserId: input.actorUserId } : {}),
          },
        }),
      );
    }

    if (input.staffSignatureName && input.actorUserId) {
      results.push(
        await this.recordAcceptance({
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          customerId: input.customerId,
          actor: { actorType: 'STAFF_USER', actorId: input.actorUserId },
          acceptanceType,
          documentType: protocolDoc?.documentType ?? documentType,
          documentVersion: snapshotVersion,
          immutableDocumentHash: snapshotHash,
          language: snapshotLanguage,
          purpose: `${input.kind} staff countersignature`,
          source: 'handover_flow',
          handoverProtocolId: input.handoverProtocolId,
          generatedDocumentId: protocolDoc?.id ?? null,
          legalDocumentId: protocolDoc?.legalDocumentId ?? null,
          legalDocumentSnapshotId: snapshotId,
          requestId: `handover:${input.handoverProtocolId}:staff:${acceptanceType}`,
          metadata: {
            signatureRole: 'staff',
            signatureName: input.staffSignatureName,
            recordedByUserId: input.actorUserId,
          },
        }),
      );
    }

    return results;
  }

  private async findByRequestId(
    organizationId: string,
    requestId: string,
    tx?: Tx,
  ): Promise<BookingLegalAcceptance | null> {
    const client = tx ?? this.prisma;
    return client.bookingLegalAcceptance.findFirst({
      where: { organizationId, requestId },
    });
  }

  private async assertBookingScope(
    organizationId: string,
    bookingId: string,
    customerId?: string,
    tx?: Tx,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const booking = await client.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: { customerId: true },
    });
    if (!booking) {
      throw new BookingLegalAcceptanceError(
        BOOKING_LEGAL_ACCEPTANCE_ERROR_CODE.BOOKING_SCOPE,
        `Booking ${bookingId} not found in organization`,
        { organizationId, bookingId },
      );
    }
    if (customerId && booking.customerId !== customerId) {
      throw new BookingLegalAcceptanceError(
        BOOKING_LEGAL_ACCEPTANCE_ERROR_CODE.BOOKING_SCOPE,
        `Customer ${customerId} does not match booking contract holder`,
        { organizationId, bookingId, customerId },
      );
    }
  }

  private assertDocumentHash(hash: string): void {
    if (!hash || hash.trim().length < 8) {
      throw new BookingLegalAcceptanceError(
        BOOKING_LEGAL_ACCEPTANCE_ERROR_CODE.MISSING_DOCUMENT_HASH,
        'immutableDocumentHash is required for audit-grade acceptance records',
      );
    }
  }

  private assertMetadata(metadata: Prisma.InputJsonValue | null | undefined): void {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return;
    }
    for (const key of FORBIDDEN_METADATA_KEYS) {
      if (key in (metadata as Record<string, unknown>)) {
        throw new BookingLegalAcceptanceError(
          BOOKING_LEGAL_ACCEPTANCE_ERROR_CODE.FORBIDDEN_METADATA,
          `Metadata key "${key}" is not allowed on legal acceptance records`,
        );
      }
    }
  }

  private assertRevocationPayload(input: RecordBookingLegalAcceptanceInput): void {
    if (!input.relatedAcceptanceId) {
      throw new BookingLegalAcceptanceError(
        BOOKING_LEGAL_ACCEPTANCE_ERROR_CODE.INVALID_REVOCATION,
        'REVOCATION events require relatedAcceptanceId',
      );
    }
    if (!REVOCABLE_ACCEPTANCE_TYPES.has(input.acceptanceType)) {
      throw new BookingLegalAcceptanceError(
        BOOKING_LEGAL_ACCEPTANCE_ERROR_CODE.INVALID_REVOCATION,
        `Acceptance type ${input.acceptanceType} cannot be revoked`,
      );
    }
    if (!input.revokedAt) {
      throw new BookingLegalAcceptanceError(
        BOOKING_LEGAL_ACCEPTANCE_ERROR_CODE.INVALID_REVOCATION,
        'REVOCATION events require revokedAt',
      );
    }
  }

  private extractLanguage(metadata: unknown): string {
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      const lang = (metadata as Record<string, unknown>).language;
      if (typeof lang === 'string' && lang.length >= 2) {
        return lang.slice(0, 16);
      }
    }
    return 'de';
  }
}
