import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { LegalDocumentLegalHoldService } from './legal-document-legal-hold.service';
import type { LegalDocumentSubjectAccessExportRow } from './legal-document-retention.types';

/**
 * GDPR / Betroffenenanfragen helpers — export and anonymization respect legal hold.
 */
@Injectable()
export class LegalDocumentSubjectAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legalHold: LegalDocumentLegalHoldService,
  ) {}

  async exportForCustomer(
    organizationId: string,
    customerId: string,
  ): Promise<LegalDocumentSubjectAccessExportRow[]> {
    const evidence = await this.prisma.legalDocumentDeliveryEvidence.findMany({
      where: { organizationId, customerId },
      orderBy: { createdAt: 'asc' },
    });

    return evidence.map((row) => ({
      entityType: 'delivery_evidence',
      entityId: row.id,
      organizationId: row.organizationId,
      customerId: row.customerId,
      bookingId: row.bookingId,
      retentionClass: row.retentionClass,
      legalHold: row.legalHold,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      summary: {
        documentType: row.documentType,
        versionLabel: row.versionLabel,
        presentedAt: row.presentedAt.toISOString(),
        deliveryChannel: row.deliveryChannel,
        deliveryStatus: row.deliveryStatus,
        acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
        recipientRedactedAt: row.recipientRedactedAt?.toISOString() ?? null,
        recipientSnapshot:
          row.recipientRedactedAt != null ? { redacted: true } : row.recipientSnapshot,
      },
    }));
  }

  async anonymizeCustomerDeliveryEvidence(
    organizationId: string,
    customerId: string,
  ): Promise<{ redacted: number; skippedLegalHold: number }> {
    const rows = await this.prisma.legalDocumentDeliveryEvidence.findMany({
      where: {
        organizationId,
        customerId,
        recipientRedactedAt: null,
        deletedAt: null,
      },
    });

    let redacted = 0;
    let skippedLegalHold = 0;

    for (const row of rows) {
      if (this.legalHold.isRetentionBlockedByHold(row)) {
        skippedLegalHold += 1;
        continue;
      }
      await this.prisma.legalDocumentDeliveryEvidence.update({
        where: { id: row.id, organizationId },
        data: {
          recipientSnapshot: { redacted: true, reason: 'subject_access_request' },
          recipientRedactedAt: new Date(),
        },
      });
      redacted += 1;
    }

    return { redacted, skippedLegalHold };
  }
}
