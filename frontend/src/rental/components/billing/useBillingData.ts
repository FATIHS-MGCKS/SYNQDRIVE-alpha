import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type {
  BillingInvoiceDto,
  BillingSummaryDto,
  BillableVehiclesResponseDto,
  PaginatedBillingInvoices,
} from '../../types/billing.types';
import {
  BILLING_ORG_MISSING_MESSAGE,
  mapBillingLoadError,
} from './billing-load.utils';

export async function fetchTenantBillingData(orgId: string) {
  return Promise.all([
    api.billing.orgSummary(orgId),
    api.billing.orgInvoices(orgId),
    api.billing.orgBillableVehicles(orgId),
  ]);
}

export function useBillingData(orgId: string | undefined) {
  const [summary, setSummary] = useState<BillingSummaryDto | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoiceDto[]>([]);
  const [billableVehicles, setBillableVehicles] = useState<BillableVehiclesResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) {
      setSummary(null);
      setInvoices([]);
      setBillableVehicles(null);
      setError(BILLING_ORG_MISSING_MESSAGE);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [summaryRes, invoicesRes, vehiclesRes] = await fetchTenantBillingData(orgId);

      setSummary(summaryRes as BillingSummaryDto);

      const invoicePayload = invoicesRes as PaginatedBillingInvoices | BillingInvoiceDto[];
      const invoiceList = Array.isArray(invoicePayload)
        ? invoicePayload
        : Array.isArray(invoicePayload?.data)
          ? invoicePayload.data
          : [];
      setInvoices(invoiceList);
      setBillableVehicles(vehiclesRes as BillableVehiclesResponseDto);
    } catch (e) {
      setError(mapBillingLoadError(e));
      setSummary(null);
      setInvoices([]);
      setBillableVehicles(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    summary,
    invoices,
    billableVehicles,
    loading,
    error,
    reload: load,
  };
}
