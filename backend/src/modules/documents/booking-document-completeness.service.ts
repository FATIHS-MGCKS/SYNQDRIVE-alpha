import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { LegalDocumentResolverService } from './legal-document-resolver.service';
import { LegalDocumentsService } from './legal-documents.service';
import {
  evaluateBookingDocumentCompleteness,
} from './booking-document-completeness.engine';
import type {
  BookingDocumentCompletenessContext,
  BundleCompletenessResult,
} from './booking-document-completeness.types';
import { DOCUMENT_TYPE, type DocumentType } from './documents.constants';
import { hasOrgActiveLegalDocument } from './legal-document-type.compat';

export { cumulativeRequiredDocumentTypes } from './booking-document-completeness.engine';

/**
 * Central bundle completeness evaluation (Prompt 16/32).
 * Single source of truth — replaces scattered status derivations.
 */
@Injectable()
export class BookingDocumentCompletenessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legalResolver: LegalDocumentResolverService,
    private readonly legalDocs: LegalDocumentsService,
  ) {}

  async evaluateForBooking(
    orgId: string,
    bookingId: string,
    options: { generationError?: string | null } = {},
  ): Promise<BundleCompletenessResult> {
    const ctx = await this.loadContext(orgId, bookingId, options.generationError ?? null);
    return evaluateBookingDocumentCompleteness(ctx);
  }

  evaluateFromContext(ctx: BookingDocumentCompletenessContext): BundleCompletenessResult {
    return evaluateBookingDocumentCompleteness(ctx);
  }

  private async loadContext(
    orgId: string,
    bookingId: string,
    generationError: string | null,
  ): Promise<BookingDocumentCompletenessContext> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: { id: true, status: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const [bundle, generatedDocuments, handoverProtocols, resolution, orgActiveLegal] = await Promise.all([
      this.prisma.bookingDocumentBundle.findUnique({ where: { bookingId } }),
      this.prisma.generatedDocument.findMany({
        where: { organizationId: orgId, bookingId },
        select: {
          id: true,
          documentType: true,
          status: true,
          legalDocumentId: true,
          sentAt: true,
        },
      }),
      this.prisma.bookingHandoverProtocol.findMany({
        where: { bookingId },
        select: { kind: true, documentsAcknowledged: true },
      }),
      this.legalResolver.resolveForBooking(orgId, bookingId),
      this.legalDocs.getActiveByType(orgId, 'de'),
    ]);

    const orgActiveLegalTypes = (
      [
        DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        DOCUMENT_TYPE.CONSUMER_INFORMATION,
        DOCUMENT_TYPE.PRIVACY_POLICY,
      ] as DocumentType[]
    ).filter((t) => hasOrgActiveLegalDocument(orgActiveLegal, t));

    if (bundle && bundle.organizationId !== orgId) {
      throw new NotFoundException('Booking not found');
    }

    const legalDocumentIds = [
      ...new Set(
        generatedDocuments
          .map((d) => d.legalDocumentId)
          .filter((id): id is string => !!id),
      ),
    ];

    const legalRows =
      legalDocumentIds.length > 0
        ? await this.prisma.organizationLegalDocument.findMany({
            where: { organizationId: orgId, id: { in: legalDocumentIds } },
            select: {
              id: true,
              documentType: true,
              integrityStatus: true,
              integrityUnavailable: true,
              scanStatus: true,
            },
          })
        : [];

    const legalDocumentsById = new Map(
      legalRows.map((row) => [row.id, row]),
    );

    const generatedDocIds = generatedDocuments.map((d) => d.id);
    const deliveryProofs =
      generatedDocIds.length > 0
        ? await this.prisma.outboundEmailAttachment.findMany({
            where: {
              generatedDocumentId: { in: generatedDocIds },
              outboundEmail: { organizationId: orgId, bookingId },
            },
            select: {
              generatedDocumentId: true,
              outboundEmail: { select: { status: true } },
            },
          })
        : [];

    return {
      organizationId: orgId,
      bookingId,
      bookingStatus: booking.status,
      bundle: bundle
        ? {
            termsDocumentId: bundle.termsDocumentId,
            withdrawalDocumentId: bundle.withdrawalDocumentId,
            privacyDocumentId: bundle.privacyDocumentId,
            bookingInvoiceDocumentId: bundle.bookingInvoiceDocumentId,
            depositReceiptDocumentId: bundle.depositReceiptDocumentId,
            rentalContractDocumentId: bundle.rentalContractDocumentId,
            pickupProtocolDocumentId: bundle.pickupProtocolDocumentId,
            returnProtocolDocumentId: bundle.returnProtocolDocumentId,
            finalInvoiceDocumentId: bundle.finalInvoiceDocumentId,
          }
        : null,
      generatedDocuments: generatedDocuments.map((d) => ({
        id: d.id,
        documentType: d.documentType,
        status: d.status,
        legalDocumentId: d.legalDocumentId,
        sentAt: d.sentAt,
      })),
      legalDocumentsById,
      resolverVersion: resolution.resolverVersion,
      resolverConflicts: resolution.conflicts.map((c) => ({
        documentType: c.documentType,
        reason: c.reason,
      })),
      resolverMissingMandatory: resolution.missingMandatoryDocuments.map((m) => ({
        documentType: m.documentType,
        reason: m.reason,
      })),
      resolverSelectedTypes: resolution.selectedDocuments.map(
        (s) => s.documentType as import('./documents.constants').DocumentType,
      ),
      handoverProtocols,
      deliveryProofs: deliveryProofs
        .filter((p) => p.generatedDocumentId)
        .map((p) => ({
          generatedDocumentId: p.generatedDocumentId!,
          emailStatus: p.outboundEmail.status,
        })),
      generationError,
      evaluatedAt: new Date().toISOString(),
      orgActiveLegalTypes,
    };
  }
}
