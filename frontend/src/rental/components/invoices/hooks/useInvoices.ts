import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { api } from '../../../../lib/api';
import type { Invoice, InvoiceStats } from '../invoiceTypes';
import type { InvoiceDirectionFilter } from '../invoiceConstants';
import { STATUS_MAP } from '../invoiceFormatters';
import { mapInvoiceListItemToInvoiceRow } from '../invoiceListItem.mapper';

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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [lookup, setLookup] = useState<InvoiceLookupData>({
    customers: [],
    vehicles: [],
    vendors: [],
  });
  const [lookupLoaded, setLookupLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState<InvoiceDirectionFilter>('all');
  const [isDirectionOpen, setIsDirectionOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [listResult, iStats] = await Promise.all([
        api.invoices.listItems(orgId, {
          page: 1,
          limit: 100,
          search: searchTerm.trim() || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          direction: directionFilter !== 'all' ? directionFilter : undefined,
          sortBy: 'invoiceDate',
          sortOrder: 'desc',
        }),
        api.invoices.stats(orgId),
      ]);
      setInvoices(listResult.data.map(mapInvoiceListItemToInvoiceRow));
      setListTotal(listResult.meta.total);
      setStats(iStats);
    } catch {
      toast.error('Rechnungen konnten nicht geladen werden');
      setInvoices([]);
      setListTotal(0);
    } finally {
      setLoading(false);
    }
  }, [orgId, searchTerm, statusFilter, directionFilter]);

  const loadLookup = useCallback(async () => {
    if (!orgId || lookupLoaded) return;
    try {
      const [cList, vList, venList] = await Promise.all([
        api.customers.list(orgId).catch(() => []),
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

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = invoices;

  const statusCount = useCallback(
    (status: string) => {
      if (status === 'all') return stats?.total ?? listTotal;
      return stats?.statusCounts?.[status] ?? 0;
    },
    [stats, listTotal],
  );

  const directionCount = useCallback(
    (direction: InvoiceDirectionFilter) => {
      if (direction === 'all') return stats?.total ?? listTotal;
      if (direction === 'outgoing') return stats?.outgoing ?? 0;
      return stats?.incoming ?? 0;
    },
    [stats, listTotal],
  );

  const unpaidCount = stats?.unpaid ?? 0;
  const overdueCount = stats?.overdue ?? 0;

  const activeDirectionLabel =
    directionFilter === 'all'
      ? 'Alle Richtungen'
      : directionFilter === 'outgoing'
        ? 'Ausgehend'
        : 'Eingehend';

  const activeStatusLabel =
    statusFilter === 'all' ? 'Alle Status' : STATUS_MAP[statusFilter]?.label || statusFilter;

  const hasActiveFilters =
    Boolean(searchTerm) || statusFilter !== 'all' || directionFilter !== 'all';

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setStatusFilter('all');
    setDirectionFilter('all');
    setIsDirectionOpen(false);
    setIsStatusOpen(false);
  }, []);

  return {
    invoices,
    stats,
    lookup,
    loading,
    reload,
    loadLookup,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    directionFilter,
    setDirectionFilter,
    isDirectionOpen,
    setIsDirectionOpen,
    isStatusOpen,
    setIsStatusOpen,
    filtered,
    statusCount,
    directionCount,
    unpaidCount,
    overdueCount,
    activeDirectionLabel,
    activeStatusLabel,
    hasActiveFilters,
    clearFilters,
    listTotal,
  };
}
