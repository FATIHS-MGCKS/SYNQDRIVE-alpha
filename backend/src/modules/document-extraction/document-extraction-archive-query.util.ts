import { DocumentExtractionStatus, Prisma } from '@prisma/client';
import type { ListDocumentExtractionArchiveQueryDto } from './dto/list-document-extraction-archive-query.dto';
import type {
  DocumentExtractionArchiveActionStatus,
  DocumentExtractionArchiveFollowUpStatus,
} from './document-extraction-archive-index.materializer';

export interface DocumentExtractionArchiveListFilters {
  organizationId: string;
  status?: DocumentExtractionStatus;
  documentCategory?: string;
  documentSubtype?: string;
  vehicleId?: string;
  bookingId?: string;
  customerId?: string;
  driverId?: string;
  vendorId?: string;
  uploadedBy?: string;
  uploadedFrom?: string;
  uploadedTo?: string;
  fileName?: string;
  invoiceNumber?: string;
  caseReference?: string;
  actionStatus?: DocumentExtractionArchiveActionStatus;
  followUpStatus?: DocumentExtractionArchiveFollowUpStatus;
  q?: string;
}

export function buildDocumentExtractionArchiveWhere(
  filters: DocumentExtractionArchiveListFilters,
): Prisma.DocumentExtractionArchiveIndexWhereInput {
  const where: Prisma.DocumentExtractionArchiveIndexWhereInput = {
    organizationId: filters.organizationId,
  };

  if (filters.status) where.status = filters.status;
  if (filters.documentCategory) where.documentCategory = filters.documentCategory;
  if (filters.documentSubtype) where.documentSubtype = filters.documentSubtype;
  if (filters.vehicleId) where.vehicleId = filters.vehicleId;
  if (filters.bookingId) where.bookingId = filters.bookingId;
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.driverId) where.driverId = filters.driverId;
  if (filters.vendorId) where.vendorId = filters.vendorId;
  if (filters.uploadedBy) where.createdById = filters.uploadedBy;
  if (filters.actionStatus) where.actionStatus = filters.actionStatus;
  if (filters.followUpStatus) where.followUpStatus = filters.followUpStatus;

  if (filters.uploadedFrom || filters.uploadedTo) {
    where.uploadedAt = {};
    if (filters.uploadedFrom) where.uploadedAt.gte = new Date(filters.uploadedFrom);
    if (filters.uploadedTo) where.uploadedAt.lte = new Date(filters.uploadedTo);
  }

  if (filters.fileName) {
    where.sourceFileName = { contains: filters.fileName, mode: 'insensitive' };
  }
  if (filters.invoiceNumber) {
    where.invoiceNumber = { contains: filters.invoiceNumber, mode: 'insensitive' };
  }
  if (filters.caseReference) {
    where.caseReference = { contains: filters.caseReference, mode: 'insensitive' };
  }

  if (filters.q) {
    where.searchText = { contains: filters.q.trim().toLowerCase(), mode: 'insensitive' };
  }

  return where;
}

export function parseDocumentExtractionArchivePagination(
  query: ListDocumentExtractionArchiveQueryDto,
): {
  skip: number;
  take: number;
  page: number;
  limit: number;
} {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(50, Math.max(1, query.limit ?? 20));
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}
