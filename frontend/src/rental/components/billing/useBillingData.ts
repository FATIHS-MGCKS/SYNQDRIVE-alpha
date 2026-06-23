import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type {
  BillingInvoiceDto,
  BillingSummaryDto,
  BillableVehiclesResponseDto,
  PaginatedBillingInvoices,
} from '../../types/billing.types';

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
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [summaryRes, invoicesRes, vehiclesRes] = await Promise.all([
        api.billing.orgSummary(),
        api.billing.orgInvoices(),
        api.billing.orgBillableVehicles(),
      ]);

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
      setError((e as Error).message || 'Abrechnungsdaten konnten nicht geladen werden');
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
