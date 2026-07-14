import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { api } from '../../../../lib/api';
import type { Invoice, InvoiceStats } from '../invoiceTypes';
import type { InvoiceDirectionFilter } from '../invoiceConstants';
import { STATUS_MAP } from '../invoiceFormatters';
import {
  countInvoicesByDirection,
  countInvoicesByStatus,
  filterInvoices,
} from '../invoiceList.util';

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
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [lookup, setLookup] = useState<InvoiceLookupData>({
    customers: [],
    vehicles: [],
    vendors: [],
  });
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
      const [iList, iStats, cList, vList, venList] = await Promise.all([
        api.invoices.list(orgId),
        api.invoices.stats(orgId),
        api.customers.list(orgId).catch(() => []),
        api.vehicles.listByOrg(orgId).catch(() => []),
        api.vendors.list(orgId).catch(() => []),
      ]);
      setInvoices(Array.isArray(iList) ? iList : (iList as { data?: Invoice[] })?.data || []);
      setStats(iStats);
      setLookup({
        customers: Array.isArray(cList) ? cList : (cList as { data?: Array<Record<string, unknown>> })?.data || [],
        vehicles: (Array.isArray(vList) ? vList : (vList as { data?: InvoiceLookupVehicle[] })?.data || []) as InvoiceLookupVehicle[],
        vendors: (Array.isArray(venList) ? venList : []) as Array<{ id: string; name: string }>,
      });
    } catch {
      toast.error('Rechnungen konnten nicht geladen werden');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(
    () => filterInvoices(invoices, searchTerm, statusFilter, directionFilter),
    [invoices, searchTerm, statusFilter, directionFilter],
  );

  const statusCount = useCallback(
    (status: string) => countInvoicesByStatus(invoices, status),
    [invoices],
  );

  const directionCount = useCallback(
    (direction: InvoiceDirectionFilter) => countInvoicesByDirection(invoices, direction),
    [invoices],
  );

  const unpaidCount = stats?.unpaid ?? 0;
  const overdueCount = stats?.overdue ?? invoices.filter((inv) => inv.status === 'OVERDUE').length;

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
  };
}
