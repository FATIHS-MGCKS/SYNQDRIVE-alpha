import {
  OrgInvoiceStatus,
  OrgInvoiceType,
  Prisma,
} from '@prisma/client';
import {
  INCOMING_TYPES,
  isOutgoingInvoiceType,
  OUTGOING_TYPES,
} from './invoice-domain.util';
import type { InvoiceListDocumentFilter } from './dto/invoice-list-item.dto';
import type { InvoiceListSortField, ListInvoicesQueryDto } from './dto/list-invoices-query.dto';

export const OPEN_OVERDUE_EXCLUDED_STATUSES: OrgInvoiceStatus[] = [
  'PAID',
  'CANCELLED',
  'VOID',
  'CREDITED',
  'REJECTED',
  'DRAFT',
];

export interface InvoiceListSearchScope {
  customerIds: string[];
  vendorIds: string[];
  bookingIds: string[];
  vehicleIds: string[];
  documentInvoiceIds: string[];
}

export function parseInvoiceListPagination(query: ListInvoicesQueryDto): {
  page: number;
  limit: number;
  skip: number;
  take: number;
} {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function buildInvoiceListOrderBy(
  sortBy: InvoiceListSortField,
  sortOrder: 'asc' | 'desc',
): Prisma.OrgInvoiceOrderByWithRelationInput[] {
  const dir = sortOrder;
  const stableId: Prisma.OrgInvoiceOrderByWithRelationInput = { id: dir };

  switch (sortBy) {
    case 'dueDate':
      return [{ dueDate: { sort: dir, nulls: 'last' } }, stableId];
    case 'totalGross':
      return [{ totalCents: dir }, stableId];
    case 'status':
      return [{ status: dir }, stableId];
    case 'invoiceNumber':
      return [
        { sequenceYear: { sort: dir, nulls: 'last' } },
        { sequenceNumber: { sort: dir, nulls: 'last' } },
        { legacyInvoiceNumber: { sort: dir, nulls: 'last' } },
        stableId,
      ];
    case 'createdAt':
      return [{ createdAt: dir }, stableId];
    case 'invoiceDate':
    default:
      return [{ invoiceDate: dir }, stableId];
  }
}

export function buildInvoiceListBaseWhere(
  orgId: string,
  query: ListInvoicesQueryDto,
): Prisma.OrgInvoiceWhereInput {
  const where: Prisma.OrgInvoiceWhereInput = { organizationId: orgId };

  if (query.type) {
    where.type = query.type;
  }

  if (query.status) {
    where.status = query.status;
  } else if (!query.includeVoid) {
    where.status = { notIn: ['VOID', 'CANCELLED', 'CREDITED'] };
  }

  if (query.direction === 'outgoing') {
    where.type = query.type ?? { in: [...OUTGOING_TYPES] };
  } else if (query.direction === 'incoming') {
    where.type = query.type ?? { in: [...INCOMING_TYPES] };
  }

  if (query.dateFrom || query.dateTo) {
    where.invoiceDate = {};
    if (query.dateFrom) where.invoiceDate.gte = new Date(query.dateFrom);
    if (query.dateTo) where.invoiceDate.lte = new Date(query.dateTo);
  }

  if (query.dueFrom || query.dueTo) {
    where.dueDate = {};
    if (query.dueFrom) where.dueDate.gte = new Date(query.dueFrom);
    if (query.dueTo) where.dueDate.lte = new Date(query.dueTo);
  }

  if (query.overdue === true) {
    const now = new Date();
    const dueFilter = (where.dueDate as Prisma.DateTimeNullableFilter | undefined) ?? {};
    where.dueDate = { ...dueFilter, lt: now };
    where.outstandingCents = { gt: 0 };
    if (!query.status) {
      where.status = { notIn: OPEN_OVERDUE_EXCLUDED_STATUSES };
    }
  }

  return where;
}

export function buildInvoiceSearchOrClauses(
  search: string,
  scope: InvoiceListSearchScope,
): Prisma.OrgInvoiceWhereInput[] {
  const q = search.trim();
  const clauses: Prisma.OrgInvoiceWhereInput[] = [
    { invoiceNumberDisplay: { contains: q, mode: 'insensitive' } },
    { title: { contains: q, mode: 'insensitive' } },
    { vendorName: { contains: q, mode: 'insensitive' } },
  ];

  const legacyNum = Number(q.replace(/^#/, ''));
  if (Number.isInteger(legacyNum) && legacyNum > 0) {
    clauses.push({ legacyInvoiceNumber: legacyNum });
    clauses.push({ invoiceNumber: legacyNum });
  }

  if (scope.customerIds.length) {
    clauses.push({ customerId: { in: scope.customerIds } });
  }
  if (scope.vendorIds.length) {
    clauses.push({ vendorId: { in: scope.vendorIds } });
  }
  if (scope.bookingIds.length) {
    clauses.push({ bookingId: { in: scope.bookingIds } });
  }
  if (scope.vehicleIds.length) {
    clauses.push({ vehicleId: { in: scope.vehicleIds } });
  }
  if (scope.documentInvoiceIds.length) {
    clauses.push({ id: { in: scope.documentInvoiceIds } });
  }

  return clauses;
}

export function applyInvoiceListAuxiliaryFilters(
  where: Prisma.OrgInvoiceWhereInput,
  opts: {
    search?: string;
    searchScope?: InvoiceListSearchScope;
    stationBookingIds?: string[];
    sendStatusInvoiceIds?: string[];
    documentInvoiceIds?: string[];
    documentStatus?: InvoiceListDocumentFilter;
  },
): Prisma.OrgInvoiceWhereInput {
  const and: Prisma.OrgInvoiceWhereInput[] = [where];

  if (opts.search?.trim() && opts.searchScope) {
    and.push({ OR: buildInvoiceSearchOrClauses(opts.search, opts.searchScope) });
  }

  if (opts.stationBookingIds !== undefined) {
    if (opts.stationBookingIds.length === 0) {
      and.push({ id: '__none__' });
    } else {
      and.push({ bookingId: { in: opts.stationBookingIds } });
    }
  }

  if (opts.sendStatusInvoiceIds !== undefined) {
    if (opts.sendStatusInvoiceIds.length === 0) {
      and.push({ id: '__none__' });
    } else {
      and.push({ id: { in: opts.sendStatusInvoiceIds } });
    }
  }

  if (opts.documentStatus === 'missing') {
    and.push({ generatedDocumentId: null });
  } else if (opts.documentStatus === 'present') {
    and.push({ generatedDocumentId: { not: null } });
  } else if (opts.documentStatus === 'failed') {
    if (!opts.documentInvoiceIds || opts.documentInvoiceIds.length === 0) {
      and.push({ id: '__none__' });
    } else {
      and.push({ id: { in: opts.documentInvoiceIds } });
    }
  }

  return and.length === 1 ? where : { AND: and };
}

export function isInvoiceOverdue(input: {
  dueDate: Date | null;
  outstandingCents: number;
  status: OrgInvoiceStatus;
  now?: Date;
}): boolean {
  if (!input.dueDate) return false;
  if (input.outstandingCents <= 0) return false;
  if (OPEN_OVERDUE_EXCLUDED_STATUSES.includes(input.status)) return false;
  return input.dueDate < (input.now ?? new Date());
}

export function invoiceListDirection(type: OrgInvoiceType): 'outgoing' | 'incoming' {
  return isOutgoingInvoiceType(type) ? 'outgoing' : 'incoming';
}

export function resolveInvoiceListSort(
  query: ListInvoicesQueryDto,
): { sortBy: InvoiceListSortField; sortOrder: 'asc' | 'desc' } {
  return {
    sortBy: query.sortBy ?? 'invoiceDate',
    sortOrder: query.sortOrder ?? 'desc',
  };
}
