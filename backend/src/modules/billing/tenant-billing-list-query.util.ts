import { TenantBillingListQueryDto } from './dto/tenant-billing-list-query.dto';

export interface ParsedTenantBillingListQuery {
  page: number;
  limit: number;
  skip: number;
  take: number;
  sortField: string | null;
  sortOrder: 'asc' | 'desc';
  status?: string;
  from?: Date;
  to?: Date;
  search?: string;
}

export function parseTenantBillingListQuery(
  query: TenantBillingListQueryDto,
  opts?: {
    defaultSortField?: string;
    defaultSortOrder?: 'asc' | 'desc';
    allowedSortFields?: readonly string[];
  },
): ParsedTenantBillingListQuery {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.pageSize ?? query.limit ?? 20));
  const parsedSort = parseTenantBillingSort(
    query.sort,
    opts?.defaultSortField ?? null,
    opts?.defaultSortOrder ?? 'desc',
    opts?.allowedSortFields,
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
    sortField: parsedSort.field,
    sortOrder: parsedSort.order,
    status: query.status?.trim() || undefined,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    search: query.search?.trim() || undefined,
  };
}

function parseTenantBillingSort(
  raw: string | undefined,
  defaultField: string | null,
  defaultOrder: 'asc' | 'desc',
  allowedFields?: readonly string[],
): { field: string | null; order: 'asc' | 'desc' } {
  const value = raw?.trim();
  if (!value) {
    return { field: defaultField, order: defaultOrder };
  }

  let field = value;
  let order: 'asc' | 'desc' = defaultOrder;

  if (value.startsWith('-')) {
    field = value.slice(1);
    order = 'desc';
  } else if (value.includes(':')) {
    const [name, direction] = value.split(':', 2);
    field = name;
    order = direction?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  }

  if (allowedFields && !allowedFields.includes(field)) {
    return { field: defaultField, order: defaultOrder };
  }

  return { field, order };
}
