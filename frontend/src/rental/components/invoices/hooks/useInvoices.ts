import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { api, type Station } from '../../../lib/api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { InvoiceDirectionFilter } from '../invoiceConstants';
import { STATUS_MAP } from '../invoiceFormatters';
import {
  buildInvoiceListApiParams,
  DEFAULT_INVOICE_LIST_FILTERS,
  hasActiveInvoiceListFilters,
  readInvoiceListFiltersFromUrl,
  syncInvoiceListFiltersToUrl,
  type InvoiceListFilters,
} from '../invoiceListState';
import type { InvoiceListItem, InvoiceStats, PaginatedInvoiceList } from '../invoiceTypes';

export interface InvoiceLookupVehicle {
  id: string;
  make?: string;
  model?: string;
  licensePlate?: string;
  license?: string;
  vehicleName?: string;
  vin?: string;
}

export interface InvoiceLookupData {
  customers: Array<Record<string, unknown>>;
  vehicles: InvoiceLookupVehicle[];
  vendors: Array<{ id: string; name: string }>;
}

export function useInvoices(orgId: string | undefined) {
  const [filters, setFilters] = useState<InvoiceListFilters>(() => ({
    ...DEFAULT_INVOICE_LIST_FILTERS,
    ...readInvoiceListFiltersFromUrl(),
  }));
  const [searchDraft, setSearchDraft] = useState(() => filters.search);
  const debouncedSearch = useDebouncedValue(searchDraft, 350);

  const [items, setItems] = useState<InvoiceListItem[]>([]);
  const [meta, setMeta] = useState<PaginatedInvoiceList['meta'] | null>(null);
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [lookup, setLookup] = useState<InvoiceLookupData>({
    customers: [],
    vehicles: [],
    vendors: [],
  });
  const [lookupLoaded, setLookupLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchGeneration = useRef(0);
  const prevDebouncedSearch = useRef(debouncedSearch);

  useEffect(() => {
    if (prevDebouncedSearch.current !== debouncedSearch) {
      prevDebouncedSearch.current = debouncedSearch;
      setFilters((prev) => ({ ...prev, page: 1 }));
    }
  }, [debouncedSearch]);

  const reload = useCallback(async () => {
    if (!orgId) return;
    const generation = ++fetchGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const [listResult, iStats] = await Promise.all([
        api.invoices.listItems(orgId, buildInvoiceListApiParams(filters, debouncedSearch)),
        api.invoices.stats(orgId),
      ]);
      if (generation !== fetchGeneration.current) return;
      setItems(listResult.data);
      setMeta(listResult.meta);
      setStats(iStats);
    } catch (e: unknown) {
      if (generation !== fetchGeneration.current) return;
      const message = e instanceof Error ? e.message : 'Rechnungen konnten nicht geladen werden';
      setError(message);
      setItems([]);
      setMeta(null);
      toast.error('Rechnungen konnten nicht geladen werden');
    } finally {
      if (generation === fetchGeneration.current) {
        setLoading(false);
      }
    }
  }, [orgId, filters, debouncedSearch]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    syncInvoiceListFiltersToUrl({ ...filters, search: debouncedSearch });
  }, [filters, debouncedSearch]);

  useEffect(() => {
    if (!orgId) return;
    api.stations
      .list(orgId, { selectableOnly: true })
      .then((list) => setStations(Array.isArray(list) ? list : []))
      .catch(() => setStations([]));
  }, [orgId]);

  const loadLookup = useCallback(async () => {
    if (!orgId || lookupLoaded) return;
    try {
      const [cList, vList, venList] = await Promise.all([
        api.customers.list(orgId, { limit: 100 }).catch(() => ({ data: [] })),
        api.vehicles.listByOrg(orgId).catch(() => []),
        api.vendors.list(orgId).catch(() => []),
      ]);
      setLookup({
        customers: Array.isArray(cList) ? cList : (cList as { data?: Array<Record<string, unknown>> })?.data || [],
        vehicles: (Array.isArray(vList) ? vList : (vList as { data?: InvoiceLookupVehicle[] })?.data || []) as InvoiceLookupVehicle[],
        vendors: (Array.isArray(venList) ? venList : []) as Array<{ id: string; name: string }>,
      });
      setLookupLoaded(true);
    } catch {
      // Create/upload dialogs degrade gracefully without lookup.
    }
  }, [orgId, lookupLoaded]);

  const patchFilters = useCallback((patch: Partial<InvoiceListFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...patch,
      page: patch.page ?? 1,
    }));
  }, []);

  const setPage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const setSearchTerm = useCallback((value: string) => {
    setSearchDraft(value);
  }, []);

  const setDirectionFilter = useCallback((direction: InvoiceDirectionFilter) => {
    patchFilters({ direction, page: 1 });
  }, [patchFilters]);

  const setStatusFilter = useCallback((status: string) => {
    patchFilters({
      status,
      overdue: status === 'OVERDUE',
      page: 1,
    });
  }, [patchFilters]);

  const clearFilters = useCallback(() => {
    setSearchDraft('');
    setFilters({ ...DEFAULT_INVOICE_LIST_FILTERS });
  }, []);

  const statusCount = useCallback(
    (status: string) => {
      if (status === 'all') return stats?.total ?? meta?.total ?? 0;
      return stats?.statusCounts?.[status] ?? 0;
    },
    [stats, meta],
  );

  const directionCount = useCallback(
    (direction: InvoiceDirectionFilter) => {
      if (direction === 'all') return stats?.total ?? meta?.total ?? 0;
      if (direction === 'outgoing') return stats?.outgoing ?? 0;
      return stats?.incoming ?? 0;
    },
    [stats, meta],
  );

  const activeDirectionLabel =
    filters.direction === 'all'
      ? 'Alle Richtungen'
      : filters.direction === 'outgoing'
        ? 'Ausgehend'
        : 'Eingehend';

  const activeStatusLabel =
    filters.status === 'all' ? 'Alle Status' : STATUS_MAP[filters.status]?.label || filters.status;

  const hasActiveFilters = hasActiveInvoiceListFilters(
    { ...filters, search: debouncedSearch },
    debouncedSearch,
  );

  const listTotal = meta?.total ?? 0;

  const stationLabel = useMemo(() => {
    if (!filters.stationId) return null;
    return stations.find((s) => s.id === filters.stationId)?.name ?? 'Station';
  }, [filters.stationId, stations]);

  return {
    items,
    meta,
    stats,
    stations,
    lookup,
    loading,
    error,
    reload,
    loadLookup,
    filters,
    patchFilters,
    setPage,
    searchTerm: searchDraft,
    setSearchTerm,
    statusFilter: filters.status,
    setStatusFilter,
    directionFilter: filters.direction,
    setDirectionFilter,
    filtered: items,
    statusCount,
    directionCount,
    unpaidCount: stats?.unpaid ?? 0,
    overdueCount: stats?.overdue ?? 0,
    activeDirectionLabel,
    activeStatusLabel,
    stationLabel,
    hasActiveFilters,
    clearFilters,
    listTotal,
  };
}
