import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

export interface GeneratedDocumentReferenceSummary {
  total: number;
  bundlePointers: number;
  rentalContractPointers: number;
  outboundEmailAttachments: number;
  deliveryEvidence: number;
  activeInvoice: number;
}

@Injectable()
export class LegalDocumentRetentionReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async countMasterDocumentBlockingReferences(
    organizationId: string,
    legalDocumentId: string,
  ): Promise<number> {
    const [deliveryEvidence, generated] = await Promise.all([
      this.prisma.legalDocumentDeliveryEvidence.count({
        where: {
          organizationId,
          legalDocumentId,
          deletedAt: null,
        },
      }),
      this.prisma.generatedDocument.count({
        where: {
          organizationId,
          legalDocumentId,
          deletedAt: null,
          storagePurgedAt: null,
        },
      }),
    ]);
    return deliveryEvidence + generated;
  }

  async summarizeGeneratedDocumentReferences(
    organizationId: string,
    generatedDocumentId: string,
  ): Promise<GeneratedDocumentReferenceSummary> {
    const [
      bundlePointers,
      rentalContractPointers,
      outboundEmailAttachments,
      deliveryEvidence,
      activeInvoice,
    ] = await Promise.all([
      this.prisma.bookingDocumentBundle.count({
        where: {
          organizationId,
          OR: [
            { termsDocumentId: generatedDocumentId },
            { withdrawalDocumentId: generatedDocumentId },
            { privacyDocumentId: generatedDocumentId },
            { bookingInvoiceDocumentId: generatedDocumentId },
            { depositReceiptDocumentId: generatedDocumentId },
            { rentalContractDocumentId: generatedDocumentId },
            { pickupProtocolDocumentId: generatedDocumentId },
            { returnProtocolDocumentId: generatedDocumentId },
            { finalInvoiceDocumentId: generatedDocumentId },
          ],
        },
      }),
      this.prisma.rentalContract.count({
        where: {
          organizationId,
          OR: [
            { termsDocumentId: generatedDocumentId },
            { withdrawalDocumentId: generatedDocumentId },
            { privacyDocumentId: generatedDocumentId },
          ],
        },
      }),
      this.prisma.outboundEmailAttachment.count({
        where: {
          generatedDocumentId,
          outboundEmail: { organizationId },
        },
      }),
      this.prisma.legalDocumentDeliveryEvidence.count({
        where: {
          organizationId,
          generatedDocumentId,
          deletedAt: null,
        },
      }),
      this.prisma.orgInvoice.count({
        where: {
          organizationId,
          generatedDocumentId,
        },
      }),
    ]);

    const total =
      bundlePointers +
      rentalContractPointers +
      outboundEmailAttachments +
      deliveryEvidence +
      activeInvoice;

    return {
      total,
      bundlePointers,
      rentalContractPointers,
      outboundEmailAttachments,
      deliveryEvidence,
      activeInvoice,
    };
  }

  hasActiveGeneratedDocumentReferences(summary: GeneratedDocumentReferenceSummary): boolean {
    return summary.total > 0;
  }
}
