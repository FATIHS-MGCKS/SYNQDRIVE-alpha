import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { api } from '../../../../lib/api';
import type { InvoiceTimelinePanel } from '../invoiceTimelineTypes';

export function useInvoiceTimeline(orgId: string, invoiceId: string) {
  const [panel, setPanel] = useState<InvoiceTimelinePanel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!orgId || !invoiceId) return null;
    try {
      const next = await api.invoices.getTimeline(orgId, invoiceId);
      setPanel(next);
      setError(null);
      return next;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Verlauf konnte nicht geladen werden';
      setError(message);
      toast.error(message);
      return null;
    }
  }, [orgId, invoiceId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void reload().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  return { panel, loading, error, reload };
}
