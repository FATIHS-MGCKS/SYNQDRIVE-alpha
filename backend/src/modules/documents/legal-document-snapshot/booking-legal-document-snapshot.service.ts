import { Injectable } from '@nestjs/common';
import type {
  BookingLegalDocumentSnapshot,
  GeneratedDocument,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { LegalDocumentChecksumVerificationService } from '../integrity/legal-document-checksum-verification.service';
import { LEGAL_DOCUMENT_INTEGRITY_STATUS } from '../integrity/legal-document-integrity.constants';
import {
  BOOKING_LEGAL_DOCUMENT_SNAPSHOT_ERROR_CODE,
  BOOKING_LEGAL_DOCUMENT_SNAPSHOT_EVENT_TYPE,
  CHECKOUT_LEGAL_DOCUMENT_TYPES,
  LEGAL_DOCUMENT_HASH_ALGORITHM,
} from './booking-legal-document-snapshot.constants';
import { BookingLegalDocumentSnapshotError } from './booking-legal-document-snapshot.errors';
import {
  buildSnapshotIdempotencyKey,
  extractLanguageFromGeneratedDocument,
  toBookingLegalDocumentSnapshotDto,
  type BookingLegalDocumentSnapshotDto,
  type CreateSnapshotFromGeneratedDocumentInput,
} from './booking-legal-document-snapshot.types';
import { DOCUMENT_TYPE } from '../documents.constants';

type Tx = Prisma.TransactionClient;

@Injectable()
export class BookingLegalDocumentSnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checksumVerification: LegalDocumentChecksumVerificationService,
  ) {}

  async listForBooking(
    organizationId: string,
    bookingId: string,
  ): Promise<BookingLegalDocumentSnapshotDto[]> {
    await this.assertBookingScope(organizationId, bookingId);
    const rows = await this.prisma.bookingLegalDocumentSnapshot.findMany({
      where: { organizationId, bookingId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toBookingLegalDocumentSnapshotDto);
  }

  async getById(
    organizationId: string,
    snapshotId: string,
  ): Promise<BookingLegalDocumentSnapshotDto> {
    const row = await this.prisma.bookingLegalDocumentSnapshot.findFirst({
      where: { id: snapshotId, organizationId },
    });
    if (!row) {
      throw new BookingLegalDocumentSnapshotError(
        BOOKING_LEGAL_DOCUMENT_SNAPSHOT_ERROR_CODE.NOT_FOUND,
        `Legal document snapshot ${snapshotId} not found`,
        { organizationId, snapshotId },
      );
    }
    return toBookingLegalDocumentSnapshotDto(row);
  }

  async createFromGeneratedDocument(
    input: CreateSnapshotFromGeneratedDocumentInput,
    tx?: Tx,
  ): Promise<BookingLegalDocumentSnapshotDto> {
    const client = tx ?? this.prisma;
    const doc = await client.generatedDocument.findFirst({
      where: { id: input.generatedDocumentId, organizationId: input.organizationId },
    });
    if (!doc) {
      throw new BookingLegalDocumentSnapshotError(
        BOOKING_LEGAL_DOCUMENT_SNAPSHOT_ERROR_CODE.CROSS_TENANT,
        `Generated document ${input.generatedDocumentId} not found in organization`,
        { organizationId: input.organizationId, generatedDocumentId: input.generatedDocumentId },
      );
    }
    if (doc.bookingId && doc.bookingId !== input.bookingId) {
      throw new BookingLegalDocumentSnapshotError(
        BOOKING_LEGAL_DOCUMENT_SNAPSHOT_ERROR_CODE.BOOKING_SCOPE,
        `Generated document belongs to a different booking`,
        { bookingId: input.bookingId, documentBookingId: doc.bookingId },
      );
    }

    const contentHash = doc.checksum?.trim().toLowerCase();
    if (!contentHash) {
      throw new BookingLegalDocumentSnapshotError(
        BOOKING_LEGAL_DOCUMENT_SNAPSHOT_ERROR_CODE.MISSING_CHECKSUM,
        `Generated document ${doc.id} has no checksum — cannot create legal snapshot`,
        { generatedDocumentId: doc.id },
      );
    }

    const idempotencyKey = buildSnapshotIdempotencyKey(
      input.bookingId,
      doc.documentType,
      contentHash,
    );

    const existing = await client.bookingLegalDocumentSnapshot.findFirst({
      where: { organizationId: input.organizationId, idempotencyKey },
    });
    if (existing) {
      return toBookingLegalDocumentSnapshotDto(existing);
    }

    let integrityStatus: BookingLegalDocumentSnapshot['integrityStatus'] = 'UNVERIFIED';
    let integrityVerifiedAt: Date | null = null;

    if (input.verifyIntegrity !== false) {
      const verification = await this.checksumVerification.verify({
        organizationId: input.organizationId,
        legalDocumentId: doc.legalDocumentId ?? doc.id,
        objectKey: doc.objectKey,
        checksum: contentHash,
        sizeBytes: doc.sizeBytes,
      });
      if (verification.status === LEGAL_DOCUMENT_INTEGRITY_STATUS.VERIFIED) {
        integrityStatus = 'VERIFIED';
        integrityVerifiedAt = verification.checkedAt;
      } else if (verification.status === LEGAL_DOCUMENT_INTEGRITY_STATUS.CHECKSUM_MISMATCH) {
        integrityStatus = 'CHECKSUM_MISMATCH';
      } else if (verification.status === LEGAL_DOCUMENT_INTEGRITY_STATUS.MISSING_OBJECT) {
        integrityStatus = 'MISSING_OBJECT';
      }
    }

    const row = await client.bookingLegalDocumentSnapshot.create({
      data: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        documentType: doc.documentType,
        templateKey: doc.templateKey,
        templateVersion: doc.templateVersion,
        renderedVersion: doc.legalVersionLabel ?? doc.templateVersion ?? 'unknown',
        hashAlgorithm: LEGAL_DOCUMENT_HASH_ALGORITHM,
        contentHash,
        language: extractLanguageFromGeneratedDocument(doc),
        generatedDocumentId: doc.id,
        legalDocumentId: doc.legalDocumentId,
        presentationContext: input.presentationContext,
        integrityStatus,
        integrityVerifiedAt,
        idempotencyKey,
        actorUserId: input.actorUserId ?? null,
      },
    });

    await this.appendEvent(client, {
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      snapshotId: row.id,
      eventType: BOOKING_LEGAL_DOCUMENT_SNAPSHOT_EVENT_TYPE.CREATED,
      actorUserId: input.actorUserId ?? null,
      detail: {
        documentType: doc.documentType,
        renderedVersion: row.renderedVersion,
        contentHash,
        integrityStatus,
      },
    });

    if (integrityStatus === 'VERIFIED') {
      await this.appendEvent(client, {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        snapshotId: row.id,
        eventType: BOOKING_LEGAL_DOCUMENT_SNAPSHOT_EVENT_TYPE.INTEGRITY_VERIFIED,
        actorUserId: input.actorUserId ?? null,
        detail: { verifiedAt: integrityVerifiedAt?.toISOString() ?? null },
      });
    } else if (integrityStatus === 'CHECKSUM_MISMATCH' || integrityStatus === 'MISSING_OBJECT') {
      await this.appendEvent(client, {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        snapshotId: row.id,
        eventType: BOOKING_LEGAL_DOCUMENT_SNAPSHOT_EVENT_TYPE.INTEGRITY_FAILED,
        actorUserId: input.actorUserId ?? null,
        detail: { integrityStatus },
      });
    }

    return toBookingLegalDocumentSnapshotDto(row);
  }

  /**
   * Ensure checkout presentation snapshots exist for mandatory legal bundle pointers.
   * Idempotent — repeated calls return the same snapshots.
   */
  async ensureCheckoutSnapshots(
    organizationId: string,
    bookingId: string,
    options?: { actorUserId?: string | null },
  ): Promise<BookingLegalDocumentSnapshotDto[]> {
    await this.assertBookingScope(organizationId, bookingId);
    const bundle = await this.prisma.bookingDocumentBundle.findFirst({
      where: { organizationId, bookingId },
      select: {
        termsDocumentId: true,
        withdrawalDocumentId: true,
        privacyDocumentId: true,
      },
    });
    if (!bundle) return [];

    const pointerMap: Array<{ documentType: string; generatedDocumentId: string | null }> = [
      { documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, generatedDocumentId: bundle.termsDocumentId },
      { documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION, generatedDocumentId: bundle.withdrawalDocumentId },
      { documentType: DOCUMENT_TYPE.PRIVACY_POLICY, generatedDocumentId: bundle.privacyDocumentId },
    ];

    const results: BookingLegalDocumentSnapshotDto[] = [];
    for (const pointer of pointerMap) {
      if (!pointer.generatedDocumentId) continue;
      results.push(
        await this.createFromGeneratedDocument({
          organizationId,
          bookingId,
          generatedDocumentId: pointer.generatedDocumentId,
          presentationContext: 'CHECKOUT',
          actorUserId: options?.actorUserId ?? null,
        }),
      );
    }
    return results;
  }

  async verifySnapshotIntegrity(
    organizationId: string,
    snapshotId: string,
    actorUserId?: string | null,
  ): Promise<BookingLegalDocumentSnapshotDto> {
    const snapshot = await this.prisma.bookingLegalDocumentSnapshot.findFirst({
      where: { id: snapshotId, organizationId },
      include: { generatedDocument: true },
    });
    if (!snapshot) {
      throw new BookingLegalDocumentSnapshotError(
        BOOKING_LEGAL_DOCUMENT_SNAPSHOT_ERROR_CODE.NOT_FOUND,
        `Snapshot ${snapshotId} not found`,
        { organizationId, snapshotId },
      );
    }

    const verification = await this.checksumVerification.verify({
      organizationId,
      legalDocumentId: snapshot.legalDocumentId ?? snapshot.generatedDocumentId,
      objectKey: snapshot.generatedDocument.objectKey,
      checksum: snapshot.contentHash,
      sizeBytes: snapshot.generatedDocument.sizeBytes,
    });

    const integrityStatus =
      verification.status === LEGAL_DOCUMENT_INTEGRITY_STATUS.VERIFIED
        ? 'VERIFIED'
        : verification.status === LEGAL_DOCUMENT_INTEGRITY_STATUS.CHECKSUM_MISMATCH
          ? 'CHECKSUM_MISMATCH'
          : verification.status === LEGAL_DOCUMENT_INTEGRITY_STATUS.MISSING_OBJECT
            ? 'MISSING_OBJECT'
            : 'UNVERIFIED';

    const updated = await this.prisma.bookingLegalDocumentSnapshot.update({
      where: { id: snapshot.id },
      data: {
        integrityStatus,
        integrityVerifiedAt:
          integrityStatus === 'VERIFIED' ? verification.checkedAt : snapshot.integrityVerifiedAt,
      },
    });

    await this.appendEvent(this.prisma, {
      organizationId,
      bookingId: snapshot.bookingId,
      snapshotId: snapshot.id,
      eventType:
        integrityStatus === 'VERIFIED'
          ? BOOKING_LEGAL_DOCUMENT_SNAPSHOT_EVENT_TYPE.INTEGRITY_VERIFIED
          : BOOKING_LEGAL_DOCUMENT_SNAPSHOT_EVENT_TYPE.INTEGRITY_FAILED,
      actorUserId: actorUserId ?? null,
      detail: {
        integrityStatus,
        expectedChecksum: verification.expectedChecksum,
        actualChecksum: verification.actualChecksum,
      },
    });

    return toBookingLegalDocumentSnapshotDto(updated);
  }

  /**
   * Block silent regeneration: same rendered version label with different checksum.
   */
  assertNoSilentRegeneration(
    existing: Pick<GeneratedDocument, 'legalVersionLabel' | 'checksum' | 'id'>,
    incoming: { versionLabel: string; checksum: string | null },
  ): void {
    const existingVersion = existing.legalVersionLabel ?? '';
    const incomingChecksum = incoming.checksum?.trim().toLowerCase() ?? null;
    const existingChecksum = existing.checksum?.trim().toLowerCase() ?? null;
    if (
      existingVersion &&
      existingVersion === incoming.versionLabel &&
      existingChecksum &&
      incomingChecksum &&
      existingChecksum !== incomingChecksum
    ) {
      throw new BookingLegalDocumentSnapshotError(
        BOOKING_LEGAL_DOCUMENT_SNAPSHOT_ERROR_CODE.SILENT_REGENERATION,
        `Refusing silent regeneration for version ${existingVersion}: checksum changed`,
        {
          generatedDocumentId: existing.id,
          existingChecksum,
          incomingChecksum,
        },
      );
    }
  }

  async getSnapshotForDocumentType(
    organizationId: string,
    bookingId: string,
    documentType: string,
  ): Promise<BookingLegalDocumentSnapshotDto | null> {
    const row = await this.prisma.bookingLegalDocumentSnapshot.findFirst({
      where: { organizationId, bookingId, documentType },
      orderBy: { createdAt: 'desc' },
    });
    return row ? toBookingLegalDocumentSnapshotDto(row) : null;
  }

  async assertRetrievalAllowed(
    organizationId: string,
    snapshotId: string,
    actorUserId?: string | null,
  ): Promise<BookingLegalDocumentSnapshotDto> {
    const snapshot = await this.getById(organizationId, snapshotId);
    if (snapshot.integrityStatus === 'CHECKSUM_MISMATCH' || snapshot.integrityStatus === 'MISSING_OBJECT') {
      await this.appendEvent(this.prisma, {
        organizationId,
        bookingId: snapshot.bookingId,
        snapshotId: snapshot.id,
        eventType: BOOKING_LEGAL_DOCUMENT_SNAPSHOT_EVENT_TYPE.RETRIEVAL_BLOCKED,
        actorUserId: actorUserId ?? null,
        detail: { integrityStatus: snapshot.integrityStatus },
      });
      throw new BookingLegalDocumentSnapshotError(
        BOOKING_LEGAL_DOCUMENT_SNAPSHOT_ERROR_CODE.INTEGRITY_FAILED,
        `Snapshot ${snapshotId} failed integrity check — retrieval blocked`,
        { snapshotId, integrityStatus: snapshot.integrityStatus },
      );
    }
    return snapshot;
  }

  private async appendEvent(
    client: Tx,
    input: {
      organizationId: string;
      bookingId: string;
      snapshotId: string;
      eventType: string;
      actorUserId?: string | null;
      detail?: Record<string, unknown>;
    },
  ) {
    return client.bookingLegalDocumentSnapshotEvent.create({
      data: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        snapshotId: input.snapshotId,
        eventType: input.eventType,
        actorUserId: input.actorUserId ?? null,
        detail: (input.detail as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }

  private async assertBookingScope(organizationId: string, bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: { id: true },
    });
    if (!booking) {
      throw new BookingLegalDocumentSnapshotError(
        BOOKING_LEGAL_DOCUMENT_SNAPSHOT_ERROR_CODE.BOOKING_SCOPE,
        `Booking ${bookingId} not found in organization`,
        { organizationId, bookingId },
      );
    }
  }
}
