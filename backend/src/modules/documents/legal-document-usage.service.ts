import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { LegalDocumentNotFoundError } from './legal-documents-api.errors';
import type {
  LegalDocumentUsageReferenceDto,
  LegalDocumentUsageResponseDto,
} from './dto/legal-document-usage.dto';
import { buildPaginatedResult, parsePagination } from '@shared/utils/pagination';

@Injectable()
export class LegalDocumentUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsage(
    orgId: string,
    legalDocumentId: string,
    query: { page?: number; limit?: number },
  ): Promise<LegalDocumentUsageResponseDto> {
    const doc = await this.prisma.organizationLegalDocument.findFirst({
      where: { id: legalDocumentId, organizationId: orgId },
      select: { id: true },
    });
    if (!doc) throw new LegalDocumentNotFoundError();

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));
    const { skip, take } = parsePagination({ page, limit });

    const baseWhere = { organizationId: orgId, legalDocumentId };

    const [
      snapshotCount,
      bookingRows,
      contractCount,
      deliveryEvidenceCount,
      deliveryGroups,
      references,
      referenceTotal,
    ] = await Promise.all([
      this.prisma.generatedDocument.count({ where: baseWhere }),
      this.prisma.generatedDocument.findMany({
        where: { ...baseWhere, bookingId: { not: null } },
        select: { bookingId: true },
        distinct: ['bookingId'],
      }),
      this.prisma.rentalContract.count({
        where: {
          organizationId: orgId,
          OR: [
            { termsDocument: { legalDocumentId } },
            { withdrawalDocument: { legalDocumentId } },
            { privacyDocument: { legalDocumentId } },
          ],
        },
      }),
      this.prisma.legalDocumentDeliveryEvidence.count({ where: baseWhere }),
      this.prisma.legalDocumentDeliveryEvidence.groupBy({
        by: ['deliveryStatus'],
        where: baseWhere,
        _count: { _all: true },
      }),
      this.prisma.generatedDocument.findMany({
        where: baseWhere,
        select: {
          id: true,
          bookingId: true,
          documentType: true,
          generatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.generatedDocument.count({ where: baseWhere }),
    ]);

    const deliveryByStatus: Record<string, number> = {};
    for (const row of deliveryGroups) {
      deliveryByStatus[row.deliveryStatus] = row._count._all;
    }

    const bookingIds = references
      .map((row) => row.bookingId)
      .filter((id): id is string => Boolean(id));
    const contracts =
      bookingIds.length > 0
        ? await this.prisma.rentalContract.findMany({
            where: { organizationId: orgId, bookingId: { in: bookingIds } },
            select: { bookingId: true, contractNumber: true },
          })
        : [];
    const contractByBooking = new Map(contracts.map((c) => [c.bookingId, c.contractNumber]));

    const data: LegalDocumentUsageReferenceDto[] = references.map((row) => ({
      generatedDocumentId: row.id,
      bookingId: row.bookingId,
      bookingLabel: row.bookingId ? `Buchung ${row.bookingId.slice(0, 8)}` : null,
      contractNumber: row.bookingId ? contractByBooking.get(row.bookingId) ?? null : null,
      generatedAt: row.generatedAt ? row.generatedAt.toISOString() : null,
      documentType: row.documentType,
    }));

    return {
      legalDocumentId,
      summary: {
        snapshotCount,
        bookingCount: bookingRows.length,
        contractCount,
        deliveryEvidenceCount,
        deliveryByStatus,
      },
      references: buildPaginatedResult(data, referenceTotal, { page, limit }),
    };
  }
}
