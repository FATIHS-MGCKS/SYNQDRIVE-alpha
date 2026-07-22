import { useCallback, useEffect, useState } from 'react';
import { api, type LegalDocumentDto } from '../../../lib/api';
import {
  EMPTY_VERSION_HISTORY_FILTERS,
  type LegalDocumentVersionHistoryFilters,
  type LegalDocumentVersionHistorySort,
  type PaginatedMeta,
} from '../../lib/legal-document-version-history.types';
import {
  buildVersionHistoryQueryParams,
  mapDtoToVersionHistoryItem,
  VERSION_HISTORY_PAGE_SIZE,
} from '../../lib/legal-document-version-history.utils';
import type { LegalDocumentVersionHistoryItem } from '../../lib/legal-document-version-history.types';

export function useLegalDocumentVersionHistory(orgId: string, documentType: string) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<LegalDocumentVersionHistoryFilters>({
    ...EMPTY_VERSION_HISTORY_FILTERS,
  });
  const [sort, setSort] = useState<LegalDocumentVersionHistorySort>('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [items, setItems] = useState<LegalDocumentVersionHistoryItem[]>([]);
  const [documents, setDocuments] = useState<LegalDocumentDto[]>([]);
  const [meta, setMeta] = useState<PaginatedMeta>({
    total: 0,
    page: 1,
    limit: VERSION_HISTORY_PAGE_SIZE,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !documentType) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.legalDocuments.listPaginated(
        orgId,
        buildVersionHistoryQueryParams({ documentType, page, filters, sort, order }),
      );
      const docs = response.data ?? [];
      setDocuments(docs);
      setItems(docs.map(mapDtoToVersionHistoryItem));
      setMeta(
        response.meta ?? {
          total: docs.length,
          page,
          limit: VERSION_HISTORY_PAGE_SIZE,
          totalPages: 1,
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen');
      setItems([]);
      setDocuments([]);
      setMeta({ total: 0, page: 1, limit: VERSION_HISTORY_PAGE_SIZE, totalPages: 1 });
    } finally {
      setLoading(false);
    }
  }, [orgId, documentType, page, filters, sort, order]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyFilters = (patch: Partial<LegalDocumentVersionHistoryFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const applySort = (nextSort: LegalDocumentVersionHistorySort) => {
    setSort((prev) => {
      if (prev === nextSort) {
        setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setOrder('desc');
      return nextSort;
    });
    setPage(1);
  };

  return {
    items,
    documents,
    meta,
    loading,
    error,
    page,
    setPage,
    filters,
    applyFilters,
    sort,
    order,
    applySort,
    reload: load,
    pageSize: VERSION_HISTORY_PAGE_SIZE,
  };
}
