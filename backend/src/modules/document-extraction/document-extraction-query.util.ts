import { DocumentExtractionStatus, DocumentExtractionType, Prisma } from '@prisma/client';
import { ListDocumentExtractionsQueryDto } from './dto/list-document-extractions-query.dto';

export interface DocumentExtractionListFilters {
  organizationId: string;
  vehicleId?: string;
  status?: DocumentExtractionStatus;
  documentType?: DocumentExtractionType;
  createdFrom?: string;
  createdTo?: string;
  createdBy?: string;
}

export function buildDocumentExtractionWhere(
  filters: DocumentExtractionListFilters,
): Prisma.VehicleDocumentExtractionWhereInput {
  const where: Prisma.VehicleDocumentExtractionWhereInput = {
    organizationId: filters.organizationId,
  };

  if (filters.vehicleId) {
    where.vehicleId = filters.vehicleId;
  }
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.documentType) {
    where.OR = [
      { effectiveDocumentType: filters.documentType },
      { requestedDocumentType: filters.documentType },
      { detectedDocumentType: filters.documentType },
    ];
  }
  if (filters.createdBy) {
    where.createdById = filters.createdBy;
  }
  if (filters.createdFrom || filters.createdTo) {
    where.createdAt = {};
    if (filters.createdFrom) {
      where.createdAt.gte = new Date(filters.createdFrom);
    }
    if (filters.createdTo) {
      where.createdAt.lte = new Date(filters.createdTo);
    }
  }

  return where;
}

export function parseDocumentExtractionPagination(query: ListDocumentExtractionsQueryDto): {
  skip: number;
  take: number;
  page: number;
  limit: number;
} {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(
    50,
    Math.max(1, query.limit ?? 20),
  );
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function buildDocumentExtractionPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
) {
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    },
  };
}
