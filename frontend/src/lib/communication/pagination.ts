export interface CommunicationPaginationPage {
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ResolvedCommunicationPagination extends CommunicationPaginationPage {
  /** True when backend claims more pages but cursor does not advance. */
  stalled: boolean;
}

/** Defensive client guard against malformed backend pagination cursors. */
export function resolveCommunicationPagination(
  requestedCursor: string | null,
  page: CommunicationPaginationPage,
): ResolvedCommunicationPagination {
  if (!page.hasMore) {
    return { hasMore: false, nextCursor: null, stalled: false };
  }

  if (!page.nextCursor || (requestedCursor != null && page.nextCursor === requestedCursor)) {
    return { hasMore: false, nextCursor: null, stalled: true };
  }

  return { hasMore: true, nextCursor: page.nextCursor, stalled: false };
}
