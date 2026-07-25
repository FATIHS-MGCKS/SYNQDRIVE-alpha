import { useCallback, useEffect, useState } from 'react';
import { operatorApi } from '../lib/operatorApi';
import type { OperatorBookingContextDto, OperatorProcess } from '../lib/operatorData.types';

export function useOperatorBookingContext(
  orgId: string | undefined,
  bookingId: string | undefined,
  process: OperatorProcess,
) {
  const [context, setContext] = useState<OperatorBookingContextDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!orgId || !bookingId) {
      setContext(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await operatorApi.getBookingContext(orgId, bookingId, process);
      setContext(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kontext konnte nicht geladen werden');
      setContext(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, bookingId, process]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { context, loading, error, reload };
}
