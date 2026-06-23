import { useCallback, useEffect, useState } from 'react';
import { api, type BookingDocumentBundleView } from '../../lib/api';

export function useOperatorBookingDocuments(orgId: string | undefined, bookingId: string | undefined) {
  const [view, setView] = useState<BookingDocumentBundleView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!orgId || !bookingId) {
      setView(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.documents.listForBooking(orgId, bookingId);
      setView(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dokumente konnten nicht geladen werden');
      setView(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, bookingId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { view, loading, error, reload };
}
