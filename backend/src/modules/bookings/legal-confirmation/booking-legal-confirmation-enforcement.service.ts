import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import { LegalDocumentResolverService } from '@modules/documents/legal-document-resolver.service';
import { BookingLegalDocumentSnapshotService } from '@modules/documents/legal-document-snapshot/booking-legal-document-snapshot.service';
import type { BookingLegalDocumentSnapshotDto } from '@modules/documents/legal-document-snapshot/booking-legal-document-snapshot.types';
import { BookingLegalAcceptanceService } from '../legal-acceptance/booking-legal-acceptance.service';
import {
  BOOKING_LEGAL_CONFIRMATION_ERROR_CODE,
  CHECKOUT_ACCEPTANCE_TYPE_BY_DOCUMENT,
  INVALID_SNAPSHOT_INTEGRITY_STATUSES,
  MANDATORY_CHECKOUT_ACCEPTANCE_FLAGS,
  MANDATORY_CHECKOUT_LEGAL_DOCUMENT_TYPES,
} from './booking-legal-confirmation.constants';
import { BookingLegalConfirmationError } from './booking-legal-confirmation.errors';

export interface EnforceCheckoutLegalConfirmationInput {
  organizationId: string;
  bookingId: string;
  customerId: string;
  actorUserId?: string | null;
  agbAccepted?: boolean;
  privacyAccepted?: boolean;
  marketingConsent?: boolean;
}

export interface EnforceCheckoutLegalConfirmationResult {
  snapshots: BookingLegalDocumentSnapshotDto[];
  acceptancesRecorded: number;
}

/**
 * Server-side legal confirmation gate for booking checkout (Prompt 19).
 *
 * Technical enforcement only — SynqDrive does not provide legal certification.
 * Separates mandatory contract/notice acceptance from optional marketing consent.
 */
@Injectable()
export class BookingLegalConfirmationEnforcementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legalResolver: LegalDocumentResolverService,
    private readonly legalDocumentSnapshots: BookingLegalDocumentSnapshotService,
    private readonly legalAcceptance: BookingLegalAcceptanceService,
  ) {}

  /**
   * Assert mandatory legal evidence exists, matches current org resolver output,
   * and record acceptance events. Throws with stable error codes on failure.
   */
  async enforceAndRecordCheckoutConfirmation(
    input: EnforceCheckoutLegalConfirmationInput,
  ): Promise<EnforceCheckoutLegalConfirmationResult> {
    try {
      this.assertMandatoryAcceptanceFlags(input);
      const snapshots = await this.assertMandatorySnapshots(input);
      await this.assertSnapshotsMatchResolver(input, snapshots);
      const acceptances = await this.legalAcceptance.recordCheckoutAcceptancesFromFlags({
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        customerId: input.customerId,
        actorUserId: input.actorUserId ?? null,
        agbAccepted: input.agbAccepted,
        privacyAccepted: input.privacyAccepted,
        marketingConsent: input.marketingConsent,
      });
      return { snapshots, acceptancesRecorded: acceptances.length };
    } catch (err) {
      if (err instanceof BookingLegalConfirmationError) {
        throw new ConflictException({
          code: err.code,
          message: err.message,
          ...err.details,
        });
      }
      throw err;
    }
  }

  /**
   * For direct API confirmation paths without wizard flags — require prior evidence.
   */
  async assertExistingLegalEvidenceForConfirmation(
    organizationId: string,
    bookingId: string,
  ): Promise<void> {
    const snapshots = await this.prisma.bookingLegalDocumentSnapshot.findMany({
      where: { organizationId, bookingId },
    });
    const acceptances = await this.prisma.bookingLegalAcceptance.findMany({
      where: {
        organizationId,
        bookingId,
        eventKind: 'ACCEPTANCE',
        acceptanceType: {
          in: ['TERMS_CONTRACT_ACCEPTANCE', 'PRIVACY_NOTICE_ACKNOWLEDGMENT'],
        },
      },
    });

    const missingTypes = MANDATORY_CHECKOUT_LEGAL_DOCUMENT_TYPES.filter(
      (type) => !snapshots.some((s) => s.documentType === type),
    );
    if (missingTypes.length > 0) {
      throw new ConflictException({
        code: BOOKING_LEGAL_CONFIRMATION_ERROR_CODE.LEGAL_DOCUMENT_MISSING,
        message: 'Mandatory legal document snapshots are missing for booking confirmation',
        missingDocumentTypes: missingTypes,
      });
    }

    const invalidSnapshots = snapshots.filter((s) =>
      INVALID_SNAPSHOT_INTEGRITY_STATUSES.has(s.integrityStatus),
    );
    if (invalidSnapshots.length > 0) {
      throw new ConflictException({
        code: BOOKING_LEGAL_CONFIRMATION_ERROR_CODE.LEGAL_EVIDENCE_INVALID,
        message: 'Legal document snapshot integrity check failed',
        invalidSnapshotIds: invalidSnapshots.map((s) => s.id),
      });
    }

    const hasTermsAcceptance = acceptances.some(
      (a) => a.acceptanceType === 'TERMS_CONTRACT_ACCEPTANCE',
    );
    const hasPrivacyAcceptance = acceptances.some(
      (a) => a.acceptanceType === 'PRIVACY_NOTICE_ACKNOWLEDGMENT',
    );
    if (!hasTermsAcceptance || !hasPrivacyAcceptance) {
      throw new ConflictException({
        code: BOOKING_LEGAL_CONFIRMATION_ERROR_CODE.LEGAL_ACCEPTANCE_REQUIRED,
        message: 'Mandatory legal acceptances are missing for booking confirmation',
        missingAcceptanceTypes: [
          ...(!hasTermsAcceptance ? ['TERMS_CONTRACT_ACCEPTANCE'] : []),
          ...(!hasPrivacyAcceptance ? ['PRIVACY_NOTICE_ACKNOWLEDGMENT'] : []),
        ],
      });
    }
  }

  private assertMandatoryAcceptanceFlags(input: EnforceCheckoutLegalConfirmationInput): void {
    const missingFlags: string[] = [];
    if (input.agbAccepted !== true) {
      missingFlags.push(MANDATORY_CHECKOUT_ACCEPTANCE_FLAGS[DOCUMENT_TYPE.TERMS_AND_CONDITIONS]);
    }
    if (input.privacyAccepted !== true) {
      missingFlags.push(MANDATORY_CHECKOUT_ACCEPTANCE_FLAGS[DOCUMENT_TYPE.PRIVACY_POLICY]);
    }
    if (missingFlags.length > 0) {
      throw new BookingLegalConfirmationError(
        BOOKING_LEGAL_CONFIRMATION_ERROR_CODE.LEGAL_ACCEPTANCE_REQUIRED,
        'Mandatory legal acceptances must be explicitly confirmed server-side',
        { missingFlags },
      );
    }
  }

  private async assertMandatorySnapshots(
    input: EnforceCheckoutLegalConfirmationInput,
  ): Promise<BookingLegalDocumentSnapshotDto[]> {
    const bundle = await this.prisma.bookingDocumentBundle.findFirst({
      where: { organizationId: input.organizationId, bookingId: input.bookingId },
      select: {
        termsDocumentId: true,
        withdrawalDocumentId: true,
        privacyDocumentId: true,
      },
    });

    const pointerByType: Record<string, string | null | undefined> = {
      [DOCUMENT_TYPE.TERMS_AND_CONDITIONS]: bundle?.termsDocumentId,
      [DOCUMENT_TYPE.CONSUMER_INFORMATION]: bundle?.withdrawalDocumentId,
      [DOCUMENT_TYPE.PRIVACY_POLICY]: bundle?.privacyDocumentId,
    };

    const missingPointers = MANDATORY_CHECKOUT_LEGAL_DOCUMENT_TYPES.filter(
      (type) => !pointerByType[type],
    );
    if (!bundle || missingPointers.length > 0) {
      throw new BookingLegalConfirmationError(
        BOOKING_LEGAL_CONFIRMATION_ERROR_CODE.LEGAL_DOCUMENT_MISSING,
        'Mandatory legal documents are not attached to the booking bundle',
        { missingDocumentTypes: missingPointers },
      );
    }

    const snapshots = await this.legalDocumentSnapshots.ensureCheckoutSnapshots(
      input.organizationId,
      input.bookingId,
      { actorUserId: input.actorUserId ?? null },
    );

    const missingSnapshots = MANDATORY_CHECKOUT_LEGAL_DOCUMENT_TYPES.filter(
      (type) => !snapshots.some((s) => s.documentType === type),
    );
    if (missingSnapshots.length > 0) {
      throw new BookingLegalConfirmationError(
        BOOKING_LEGAL_CONFIRMATION_ERROR_CODE.LEGAL_DOCUMENT_MISSING,
        'Mandatory legal document snapshots could not be created',
        { missingDocumentTypes: missingSnapshots },
      );
    }

    const invalidSnapshots = snapshots.filter((s) =>
      INVALID_SNAPSHOT_INTEGRITY_STATUSES.has(s.integrityStatus),
    );
    if (invalidSnapshots.length > 0) {
      throw new BookingLegalConfirmationError(
        BOOKING_LEGAL_CONFIRMATION_ERROR_CODE.LEGAL_EVIDENCE_INVALID,
        'Legal document snapshot integrity verification failed',
        {
          invalidSnapshots: invalidSnapshots.map((s) => ({
            id: s.id,
            documentType: s.documentType,
            integrityStatus: s.integrityStatus,
          })),
        },
      );
    }

    return snapshots;
  }

  private async assertSnapshotsMatchResolver(
    input: EnforceCheckoutLegalConfirmationInput,
    snapshots: BookingLegalDocumentSnapshotDto[],
  ): Promise<void> {
    const resolution = await this.legalResolver.resolveForBooking(
      input.organizationId,
      input.bookingId,
      { documentTypes: [...MANDATORY_CHECKOUT_LEGAL_DOCUMENT_TYPES] },
    );

    if (!resolution.isComplete) {
      throw new BookingLegalConfirmationError(
        BOOKING_LEGAL_CONFIRMATION_ERROR_CODE.LEGAL_DOCUMENT_MISSING,
        'Legal document resolver could not resolve all mandatory documents for this booking',
        {
          missingMandatoryDocuments: resolution.missingMandatoryDocuments,
          conflicts: resolution.conflicts,
        },
      );
    }

    const mismatches: Array<{
      documentType: string;
      expectedLegalDocumentId: string;
      expectedVersionLabel: string;
      snapshotLegalDocumentId: string | null;
      snapshotRenderedVersion: string;
    }> = [];

    for (const selected of resolution.selectedDocuments) {
      const snapshot = snapshots.find((s) => s.documentType === selected.documentType);
      if (!snapshot) continue;
      const legalIdMismatch =
        snapshot.legalDocumentId && snapshot.legalDocumentId !== selected.legalDocumentId;
      const versionMismatch = snapshot.renderedVersion !== selected.versionLabel;
      if (legalIdMismatch || versionMismatch) {
        mismatches.push({
          documentType: selected.documentType,
          expectedLegalDocumentId: selected.legalDocumentId,
          expectedVersionLabel: selected.versionLabel,
          snapshotLegalDocumentId: snapshot.legalDocumentId,
          snapshotRenderedVersion: snapshot.renderedVersion,
        });
      }
    }

    if (mismatches.length > 0) {
      throw new BookingLegalConfirmationError(
        BOOKING_LEGAL_CONFIRMATION_ERROR_CODE.LEGAL_DOCUMENT_VERSION_MISMATCH,
        'Legal document snapshots do not match the current organization document versions',
        { mismatches },
      );
    }
  }
}
