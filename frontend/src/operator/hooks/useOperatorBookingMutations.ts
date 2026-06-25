import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  api,
  getErrorMessage,
  type OperatorBookingCreatePayload,
  type OperatorBookingUpdatePayload,
} from '../../lib/api';
import { useFleetVehicles } from '../../rental/FleetContext';
import { useRentalOrg } from '../../rental/RentalContext';
import { formatOperatorBookingError } from '../bookings/operatorBooking.utils';
import { useOperatorShell } from '../context/OperatorShellContext';

export function useOperatorBookingMutations() {
  const { orgId } = useRentalOrg();
  const { triggerRefresh } = useOperatorShell();
  const { refresh: refreshFleet } = useFleetVehicles();
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const reportError = useCallback((e: unknown) => {
    const msg = getErrorMessage(e, 'Aktion fehlgeschlagen');
    const formatted = formatOperatorBookingError(msg);
    setError(formatted.description);
    toast.error(formatted.title, { description: formatted.description });
    return formatted.description;
  }, []);

  const run = useCallback(
    async <T>(
      fn: () => Promise<T>,
      successMessage: string,
      onSuccess?: () => void,
    ): Promise<T | null> => {
      if (!orgId) {
        setError('Organisation nicht geladen');
        toast.error('Organisation nicht geladen');
        return null;
      }
      if (mutating) return null;

      setMutating(true);
      setError(null);
      try {
        const result = await fn();
        triggerRefresh();
        void refreshFleet();
        toast.success(successMessage);
        onSuccess?.();
        return result;
      } catch (e) {
        reportError(e);
        return null;
      } finally {
        setMutating(false);
      }
    },
    [orgId, mutating, triggerRefresh, reportError, refreshFleet],
  );

  const createBooking = useCallback(
    (payload: OperatorBookingCreatePayload, onSuccess?: () => void) =>
      run(() => api.bookings.create(orgId!, payload), 'Buchung erstellt', onSuccess),
    [orgId, run],
  );

  const updateBooking = useCallback(
    (bookingId: string, payload: OperatorBookingUpdatePayload, onSuccess?: () => void) =>
      run(() => api.bookings.update(orgId!, bookingId, payload), 'Buchung gespeichert', onSuccess),
    [orgId, run],
  );

  const cancelBooking = useCallback(
    (bookingId: string, onSuccess?: () => void) =>
      run(() => api.bookings.cancel(orgId!, bookingId), 'Buchung storniert', onSuccess),
    [orgId, run],
  );

  const markNoShow = useCallback(
    (bookingId: string, reason?: string, onSuccess?: () => void) =>
      run(
        () => api.bookings.markNoShow(orgId!, bookingId, reason ?? null),
        'Als No-Show markiert',
        onSuccess,
      ),
    [orgId, run],
  );

  return {
    mutating,
    error,
    clearError,
    createBooking,
    updateBooking,
    cancelBooking,
    markNoShow,
  };
};
