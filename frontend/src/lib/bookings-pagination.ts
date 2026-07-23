import { api, type BookingsListParams } from './api';
import { isAbortError } from './bookings-query.utils';

export { isAbortError };

export type BookingListMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  nextCursor: string | null;
};

export type BookingListPage = {
  data: unknown[];
  meta: BookingListMeta;
};

export function unwrapBookingListPage(res: unknown): BookingListPage {
  if (Array.isArray(res)) {
    return {
      data: res,
      meta: {
        total: res.length,
        page: 1,
        limit: res.length,
        totalPages: 1,
        hasNextPage: false,
        nextCursor: null,
      },
    };
  }
  const record = res as { data?: unknown[]; meta?: Partial<BookingListMeta> };
  const data = Array.isArray(record?.data) ? record.data : [];
  const meta = record?.meta ?? {};
  const limit = typeof meta.limit === 'number' ? meta.limit : data.length || 1;
  const total = typeof meta.total === 'number' ? meta.total : data.length;
  const page = typeof meta.page === 'number' ? meta.page : 1;
  const totalPages = typeof meta.totalPages === 'number' ? meta.totalPages : Math.max(1, Math.ceil(total / limit));
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: Boolean(meta.hasNextPage ?? page < totalPages),
      nextCursor: typeof meta.nextCursor === 'string' ? meta.nextCursor : null,
    },
  };
}

export async function fetchBookingListPage(
  orgId: string,
  params: BookingsListParams,
  options?: { signal?: AbortSignal },
): Promise<BookingListPage> {
  const res = await api.bookings.list(orgId, params, options);
  return unwrapBookingListPage(res);
}

/** Fetches all pages for a bounded range query (timeline/calendar). */
export async function fetchAllBookingsInRange(
  orgId: string,
  params: Omit<BookingsListParams, 'page' | 'cursor'>,
  options?: { maxPages?: number; signal?: AbortSignal },
): Promise<BookingListPage> {
  const maxPages = options?.maxPages ?? 20;
  const limit = params.limit ?? 100;
  const merged: unknown[] = [];
  let page = 1;
  let meta: BookingListMeta | null = null;

  while (page <= maxPages) {
    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const result = await fetchBookingListPage(
      orgId,
      { ...params, page, limit },
      { signal: options?.signal },
    );
    merged.push(...result.data);
    meta = result.meta;
    if (!result.meta.hasNextPage) break;
    page += 1;
  }

  const total = meta?.total ?? merged.length;
  return {
    data: merged,
    meta: {
      total,
      page: 1,
      limit: merged.length || limit,
      totalPages: meta?.totalPages ?? 1,
      hasNextPage: Boolean(meta && page <= maxPages && meta.hasNextPage),
      nextCursor: meta?.nextCursor ?? null,
    },
  };
}
