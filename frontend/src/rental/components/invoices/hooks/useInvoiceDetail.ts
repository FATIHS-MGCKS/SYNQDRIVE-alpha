import { useCallback } from 'react';
import { toast } from 'sonner';

import { api } from '../../../../lib/api';
import type { Invoice } from '../invoiceTypes';

export function useInvoiceDetail(orgId: string) {
  const openDetail = useCallback(
    async (
      inv: Invoice,
      onLoaded: (invoice: Invoice) => void,
    ) => {
      if (!orgId) return;
      try {
        const full = await api.invoices.get(orgId, inv.id);
        onLoaded(full);
      } catch {
        toast.error('Rechnungsdetails konnten nicht geladen werden');
        onLoaded(inv);
      }
    },
    [orgId],
  );

  const refreshInvoice = useCallback(
    async (invoiceId: string, onUpdated: (invoice: Invoice) => void) => {
      try {
        const fresh = await api.invoices.get(orgId, invoiceId);
        onUpdated(fresh);
        return fresh;
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Rechnung konnte nicht aktualisiert werden');
        return null;
      }
    },
    [orgId],
  );

  return { openDetail, refreshInvoice };
}
