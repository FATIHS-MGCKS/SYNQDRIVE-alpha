import { mapBillingLoadError } from './billing-load.utils';

export const billingQueryKeys = {
  subscriptionOverview: (orgId: string) => ['billing', 'subscription-overview', orgId] as const,
  vehicleBilling: (orgId: string, queryKey: string) =>
    ['billing', 'vehicle-billing', orgId, queryKey] as const,
  invoices: (orgId: string, queryKey: string) => ['billing', 'invoices', orgId, queryKey] as const,
  paymentMethods: (orgId: string) => ['billing', 'payment-methods', orgId] as const,
  paymentHistory: (orgId: string, queryKey: string) =>
    ['billing', 'payment-history', orgId, queryKey] as const,
};

export interface BillingPaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BillingPaginatedResult<T> {
  data: T[];
  meta: BillingPaginatedMeta;
}

export function buildBillingQueryParams(
  query: Record<string, string | number | undefined | null>,
): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params[key] = String(value);
  }
  return params;
}

export function serializeBillingQueryKey(
  query: Record<string, string | number | undefined | null>,
): string {
  return JSON.stringify(buildBillingQueryParams(query));
}

export function parseBillingPaginated<T>(payload: unknown): BillingPaginatedResult<T> {
  if (payload == null) {
    return {
      data: [],
      meta: {
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      },
    };
  }

  if (Array.isArray(payload)) {
    return {
      data: payload as T[],
      meta: {
        total: payload.length,
        page: 1,
        limit: payload.length || 1,
        totalPages: 1,
      },
    };
  }

  const record = payload as {
    data?: T[];
    meta?: Partial<BillingPaginatedMeta>;
    total?: number;
  };

  const data = Array.isArray(record.data) ? record.data : [];
  const meta = record.meta ?? {};
  const legacyTotal = record.total;

  return {
    data,
    meta: {
      total: meta.total ?? legacyTotal ?? data.length,
      page: meta.page ?? 1,
      limit: meta.limit ?? (data.length || 20),
      totalPages: meta.totalPages ?? (data.length ? 1 : 0),
    },
  };
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

export function mapBillingQueryError(error: unknown): string {
  if (isAbortError(error)) {
    return '';
  }
  return mapBillingLoadError(error);
}

export interface BillingQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}
