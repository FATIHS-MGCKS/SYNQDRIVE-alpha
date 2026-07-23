import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { LegalDocumentOrgReadinessState } from './legal-document-operational-notification.types';

@Injectable()
export class LegalDocumentOrgReadinessLoader {
  constructor(private readonly prisma: PrismaService) {}

  async loadOrgReadinessState(organizationId: string): Promise<LegalDocumentOrgReadinessState> {
    const documents = await this.prisma.organizationLegalDocument.findMany({
      where: { organizationId },
      select: {
        id: true,
        documentType: true,
        legalVariant: true,
        versionLabel: true,
        status: true,
        language: true,
        jurisdictionCountry: true,
        scanStatus: true,
        integrityStatus: true,
        validFrom: true,
        validUntil: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      organizationId,
      documents: documents.map((doc) => ({
        id: doc.id,
        documentType: doc.documentType,
        legalVariant: doc.legalVariant,
        versionLabel: doc.versionLabel,
        status: doc.status,
        language: doc.language,
        jurisdictionCountry: doc.jurisdictionCountry,
        scanStatus: doc.scanStatus,
        integrityStatus: doc.integrityStatus,
        validFrom: doc.validFrom,
        validUntil: doc.validUntil,
      })),
      evaluatedAt: new Date().toISOString(),
    };
  }
}
