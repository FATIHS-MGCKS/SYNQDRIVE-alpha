import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type {
  DocumentExtractionArchiveActionStatus,
  DocumentExtractionArchiveFollowUpStatus,
  PublicDocumentExtractionArchiveItem,
} from '../lib/document-extraction.types';

const PAGE_SIZE = 20;

export type DocumentArchiveFilters = {
  q: string;
  status: string;
  documentCategory: string;
  documentSubtype: string;
  actionStatus: DocumentExtractionArchiveActionStatus | '';
  followUpStatus: DocumentExtractionArchiveFollowUpStatus | '';
};

export const EMPTY_ARCHIVE_FILTERS: DocumentArchiveFilters = {
  q: '',
  status: '',
  documentCategory: '',
  documentSubtype: '',
  actionStatus: '',
  followUpStatus: '',
};

export function useDocumentArchiveList(orgId: string, filters: DocumentArchiveFilters, page: number) {
  const [items, setItems] = useState<PublicDocumentExtractionArchiveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.documentExtraction.listArchiveByOrg(orgId, {
        page,
        limit: PAGE_SIZE,
        q: filters.q || undefined,
        status: filters.status || undefined,
        documentCategory: filters.documentCategory || undefined,
        documentSubtype: filters.documentSubtype || undefined,
        actionStatus: filters.actionStatus || undefined,
        followUpStatus: filters.followUpStatus || undefined,
      });
      setItems(res.data ?? []);
      setTotal(res.meta?.total ?? 0);
      setTotalPages(res.meta?.totalPages ?? 1);
    } catch {
      setError('load_failed');
      setItems([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [filters, orgId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    items,
    loading,
    error,
    total,
    totalPages,
    pageSize: PAGE_SIZE,
    reload: load,
  };
}
