import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { buildDocumentExtractionArchiveIndexRow } from './document-extraction-archive-index.materializer';
import { DocumentExtractionObservabilityService } from './document-extraction-observability.service';

type ExtractionRecord = {
  id: string;
  organizationId: string | null;
  vehicleId: string | null;
  status: import('@prisma/client').DocumentExtractionStatus;
  effectiveDocumentType?: import('@prisma/client').DocumentExtractionType | null;
  documentType?: import('@prisma/client').DocumentExtractionType | null;
  detectedDocumentSubtype?: string | null;
  sourceFileName?: string | null;
  confirmedData?: unknown;
  extractedData?: unknown;
  plausibility?: unknown;
  createdById?: string | null;
  createdAt: Date;
  appliedAt?: Date | null;
};

@Injectable()
export class DocumentExtractionArchiveIndexService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly observability: DocumentExtractionObservabilityService,
  ) {}

  async upsertForRecord(record: ExtractionRecord): Promise<void> {
    const row = buildDocumentExtractionArchiveIndexRow(record);
    if (!row) return;

    await this.prisma.documentExtractionArchiveIndex.upsert({
      where: { extractionId: row.extractionId },
      create: row,
      update: {
        organizationId: row.organizationId,
        status: row.status,
        documentCategory: row.documentCategory,
        documentSubtype: row.documentSubtype,
        effectiveDocumentType: row.effectiveDocumentType,
        vehicleId: row.vehicleId,
        bookingId: row.bookingId,
        customerId: row.customerId,
        driverId: row.driverId,
        vendorId: row.vendorId,
        createdById: row.createdById,
        sourceFileName: row.sourceFileName,
        invoiceNumber: row.invoiceNumber,
        caseReference: row.caseReference,
        actionStatus: row.actionStatus,
        followUpStatus: row.followUpStatus,
        documentDate: row.documentDate,
        searchText: row.searchText,
        uploadedAt: row.uploadedAt,
        appliedAt: row.appliedAt,
      },
    });
    this.observability.recordArchive('indexed');
  }

  async upsertMany(records: ExtractionRecord[]): Promise<void> {
    for (const record of records) {
      await this.upsertForRecord(record);
    }
  }

  async ensureIndexedForOrg(orgId: string, extractionIds: string[]): Promise<void> {
    if (extractionIds.length === 0) return;

    const existing = await this.prisma.documentExtractionArchiveIndex.findMany({
      where: { organizationId: orgId, extractionId: { in: extractionIds } },
      select: { extractionId: true },
    });
    const existingIds = new Set(existing.map((row) => row.extractionId));
    const missingIds = extractionIds.filter((id) => !existingIds.has(id));
    if (missingIds.length === 0) return;

    const records = await this.prisma.vehicleDocumentExtraction.findMany({
      where: { organizationId: orgId, id: { in: missingIds } },
    });
    await this.upsertMany(records);
  }
}
