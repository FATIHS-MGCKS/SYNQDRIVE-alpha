import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  handleBookingMutationError,
} from '../../rental/lib/booking-version-conflict';
import {
  api,
  getErrorMessage,
  type OperatorBookingCreatePayload,
  type OperatorBookingUpdatePayload,
} from '../../lib/api';
import { useRentalOrg } from '../../rental/RentalContext';
import { invalidateVehicleOperationalAfterBookingChange } from '../../rental/lib/vehicle-operational-query';
import { formatOperatorBookingError } from '../bookings/operatorBooking.utils';
import { useOperatorShell } from '../context/OperatorShellContext';

function resolveVehicleIdFromUpdatePayload(
  payload: OperatorBookingUpdatePayload,
): string | null {
  if (payload.vehicle?.connect?.id) return payload.vehicle.connect.id;
  if (payload.vehicleId) return payload.vehicleId;
  return null;
}

export function useOperatorBookingMutations() {
  const { orgId } = useRentalOrg();
  const { triggerRefresh } = useOperatorShell();
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const reportError = useCallback((e: unknown) => {
    if (
      handleBookingMutationError(e, {
        onConflictReload: () => triggerRefresh(),
      })
    ) {
      return 'Buchung wurde zwischenzeitlich geändert';
    }
    const msg = getErrorMessage(e, 'Aktion fehlgeschlagen');
    const formatted = formatOperatorBookingError(msg);
    setError(formatted.description);
    toast.error(formatted.title, { description: formatted.description });
    return formatted.description;
  }, [triggerRefresh]);

  const run = useCallback(
    async <T>(
      fn: () => Promise<T>,
      successMessage: string,
      onSuccess?: () => void,
      afterSuccess?: () => void,
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
        afterSuccess?.();
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
    [orgId, mutating, triggerRefresh, reportError],
  );

  const createBooking = useCallback(
    (payload: OperatorBookingCreatePayload, onSuccess?: () => void) =>
      run(
        () => api.bookings.create(orgId!, payload),
        'Buchung erstellt',
        onSuccess,
        () => {
          void invalidateVehicleOperationalAfterBookingChange({
            orgId: orgId!,
            vehicleId: payload.vehicle.connect.id,
            reason: 'booking-created',
          });
        },
      ),
    [orgId, run],
  );

  const updateBooking = useCallback(
    (
      bookingId: string,
      payload: OperatorBookingUpdatePayload,
      expectedUpdatedAt: string,
      onSuccess?: () => void,
      previousVehicleId?: string | null,
    ) =>
      run(
        () => api.bookings.update(orgId!, bookingId, payload, expectedUpdatedAt),
        'Buchung gespeichert',
        onSuccess,
        () => {
          const nextVehicleId = resolveVehicleIdFromUpdatePayload(payload) ?? previousVehicleId;
          void invalidateVehicleOperationalAfterBookingChange({
            orgId: orgId!,
            vehicleId: nextVehicleId,
            previousVehicleId,
            reason: 'booking-updated',
          });
        },
      ),
    [orgId, run],
  );

  const cancelBooking = useCallback(
    (
      bookingId: string,
      expectedUpdatedAt: string,
      vehicleId: string | null | undefined,
      onSuccess?: () => void,
    ) =>
      run(
        () => api.bookings.cancel(orgId!, bookingId, expectedUpdatedAt),
        'Buchung storniert',
        onSuccess,
        () => {
          void invalidateVehicleOperationalAfterBookingChange({
            orgId: orgId!,
            vehicleId,
            reason: 'booking-cancelled',
          });
        },
      ),
    [orgId, run],
  );

  const markNoShow = useCallback(
    (
      bookingId: string,
      expectedUpdatedAt: string,
      vehicleId: string | null | undefined,
      reason?: string,
      onSuccess?: () => void,
    ) =>
      run(
        () =>
          api.bookings.markNoShow(
            orgId!,
            bookingId,
            reason ?? null,
            expectedUpdatedAt,
          ),
        'Als No-Show markiert',
        onSuccess,
        () => {
          void invalidateVehicleOperationalAfterBookingChange({
            orgId: orgId!,
            vehicleId,
            reason: 'booking-no-show',
          });
        },
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
