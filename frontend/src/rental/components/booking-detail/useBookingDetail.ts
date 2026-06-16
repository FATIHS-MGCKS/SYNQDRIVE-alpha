import { useCallback, useEffect, useState } from 'react';
import { api, type BookingDetailDto } from '../../../lib/api';

export function useBookingDetail(orgId: string | null | undefined, bookingId: string | null) {
  const [detail, setDetail] = useState<BookingDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!orgId || !bookingId) {
      setDetail(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api.bookings
      .detail(orgId, bookingId)
      .then(setDetail)
      .catch((err: unknown) => {
        setDetail(null);
        const msg =
          err instanceof Error ? err.message : 'Buchungsakte konnte nicht geladen werden';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [orgId, bookingId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onHandover = () => refresh();
    window.addEventListener('handover:completed', onHandover);
    return () => window.removeEventListener('handover:completed', onHandover);
  }, [refresh]);

  return { detail, loading, error, refresh };
}
