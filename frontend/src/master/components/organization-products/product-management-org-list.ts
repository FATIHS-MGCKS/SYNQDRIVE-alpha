import { api } from '../../../lib/api';
import type { OrganizationOperationalRowDto, PaginatedOperationalResponse } from '../../organizations/types';

export type ProductManagementOrgListQuery = {
  page: number;
  limit: number;
  search?: string;
};

export function shouldUpdateOrgListState(requestId: number, activeRequestId: number): boolean {
  return requestId === activeRequestId;
}

export async function fetchProductManagementOrgPage(
  query: ProductManagementOrgListQuery,
  requestId: number,
  isStale: (id: number) => boolean,
): Promise<PaginatedOperationalResponse | null> {
  const res = await api.organizations.listOperational({
    page: query.page,
    limit: query.limit,
    search: query.search?.trim() || undefined,
  });
  if (isStale(requestId)) return null;
  return {
    data: (res.data ?? []) as OrganizationOperationalRowDto[],
    meta: res.meta ?? {
      total: res.data?.length ?? 0,
      page: query.page,
      limit: query.limit,
      totalPages: 1,
    },
  };
}