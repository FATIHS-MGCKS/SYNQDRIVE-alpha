import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import type { PublicDocumentExtractionArchiveItem } from '../lib/document-extraction.types';
import {
  deriveReviewReasonsFromArchiveItem,
  isReviewInboxArchiveItem,
  matchesReviewReasonFilter,
  type DocumentReviewReasonFilter,
} from '../lib/document-review-inbox.util';

const PAGE_SIZE = 20;
const MAX_SCAN_PAGES = 5;

export function useDocumentReviewInbox(orgId: string, reasonFilter: DocumentReviewReasonFilter = 'all') {
  const [items, setItems] = useState<PublicDocumentExtractionArchiveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalMatched, setTotalMatched] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const collected: PublicDocumentExtractionArchiveItem[] = [];
      let scanPage = page;
      let lastMetaTotalPages = 1;

      while (collected.length < PAGE_SIZE && scanPage <= page + MAX_SCAN_PAGES - 1) {
        const res = await api.documentExtraction.listArchiveByOrg(orgId, {
          page: scanPage,
          limit: PAGE_SIZE,
        });
        lastMetaTotalPages = res.meta?.totalPages ?? 1;
        const batch = (res.data ?? []).filter(isReviewInboxArchiveItem);
        for (const row of batch) {
          const reasons = deriveReviewReasonsFromArchiveItem(row);
          if (!matchesReviewReasonFilter(reasons, reasonFilter)) continue;
          if (!collected.some((entry) => entry.id === row.id)) {
            collected.push(row);
          }
        }
        if (scanPage >= lastMetaTotalPages) break;
        scanPage += 1;
      }

      setItems(collected.slice(0, PAGE_SIZE));
      setTotalPages(Math.max(1, lastMetaTotalPages));
      setTotalMatched(collected.length);
    } catch {
      setError('load_failed');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, page, reasonFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const reviewCountEstimate = useMemo(() => totalMatched, [totalMatched]);

  return {
    items,
    loading,
    error,
    page,
    setPage,
    totalPages,
    reviewCountEstimate,
    reload: load,
  };
}
