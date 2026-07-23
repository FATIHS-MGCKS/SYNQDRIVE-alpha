import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  api,
  getErrorMessage,
  type OperatorBookingCreatePayload,
  type OperatorBookingUpdatePayload,
} from '../../lib/api';
import { useRentalOrg } from '../../rental/RentalContext';
import {
  applyBookingFieldUpdates,
  bookingVersionConflictMessage,
} from '../../rental/lib/bookingUpdateCommands';
import { invalidateVehicleOperationalAfterBookingChange } from '../../rental/lib/vehicle-operational-query';
import type { BookingCancelPayload } from '../../rental/lib/booking-cancellation-reasons';
import {
  createBookingIdempotencyNonce,
  createBookingMutationIdempotencyKey,
} from '../../rental/lib/booking-status-idempotency';
import { useOperatorShell } from '../context/OperatorShellContext';

function resolveVehicleIdFromUpdatePayload(
  payload: OperatorBookingUpdatePayload,
): string | null {
  return payload.vehicleId ?? null;
}

export function useOperatorBookingMutations() {
  const { orgId } = useRentalOrg();
  const { triggerRefresh } = useOperatorShell();
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
        const versionMsg = bookingVersionConflictMessage(e);
        if (versionMsg.includes('zwischenzeitlich')) {
          setError(versionMsg);
          toast.error('Datensatz veraltet', { description: versionMsg });
        } else {
          reportError(e);
        }
        return null;
      } finally {
        setMutating(false);
      }
    },
    [orgId, mutating, triggerRefresh, reportError],
  );

  const createBooking = useCallback(
    (payload: OperatorBookingCreatePayload, onSuccess?: () => void, idempotencyNonce?: string) => {
      const nonce = idempotencyNonce ?? createBookingIdempotencyNonce();
      const idempotencyKey = createBookingMutationIdempotencyKey(
        'create',
        payload.vehicleId,
        nonce,
      );
      return run(
        () => api.bookings.create(orgId!, payload, { idempotencyKey }),
        'Buchung erstellt',
        onSuccess,
        () => {
          void invalidateVehicleOperationalAfterBookingChange({
            orgId: orgId!,
            vehicleId: payload.vehicleId,
            reason: 'booking-created',
          });
        },
      );
    },
    [orgId, run],
  );

  const updateBooking = useCallback(
    (
      bookingId: string,
      payload: OperatorBookingUpdatePayload,
      onSuccess?: () => void,
      context?: {
        previousVehicleId?: string | null;
        current?: {
          startDate?: string;
          endDate?: string;
          notes?: string | null;
          kmIncluded?: number | null;
          vehicleId?: string;
          customerId?: string;
          pickupStationId?: string | null;
          returnStationId?: string | null;
        };
      },
    ) =>
      run(
        () =>
          applyBookingFieldUpdates(
            orgId!,
            bookingId,
            payload.expectedUpdatedAt,
            {
              startDate: payload.startDate,
              endDate: payload.endDate,
              notes: payload.notes,
              kmIncluded: payload.kmIncluded,
              vehicleId: payload.vehicleId,
              customerId: payload.customerId,
              pickupStationId: payload.pickupStationId,
              returnStationId: payload.returnStationId,
              pricingQuoteId: payload.pricingQuoteId,
              pricingInput: payload.pricingInput,
            },
            context?.current,
          ),
        'Buchung gespeichert',
        onSuccess,
        () => {
          const nextVehicleId = resolveVehicleIdFromUpdatePayload(payload) ?? context?.previousVehicleId;
          void invalidateVehicleOperationalAfterBookingChange({
            orgId: orgId!,
            vehicleId: nextVehicleId,
            previousVehicleId: context?.previousVehicleId,
            reason: 'booking-updated',
          });
        },
      ),
    [orgId, run],
  );

  const cancelBooking = useCallback(
    (
      bookingId: string,
      vehicleId: string | null | undefined,
      payload: BookingCancelPayload,
      onSuccess?: () => void,
      idempotencyKey?: string,
    ) => {
      const key =
        idempotencyKey ??
        createBookingMutationIdempotencyKey('cancel', bookingId, createBookingIdempotencyNonce());
      return run(
        () => api.bookings.cancel(orgId!, bookingId, payload, { idempotencyKey: key }),
        'Buchung storniert',
        onSuccess,
        () => {
          void invalidateVehicleOperationalAfterBookingChange({
            orgId: orgId!,
            vehicleId,
            reason: 'booking-cancelled',
          });
        },
      );
    },
    [orgId, run],
  );

  const markNoShow = useCallback(
    (
      bookingId: string,
      vehicleId: string | null | undefined,
      reason?: string,
      onSuccess?: () => void,
      idempotencyKey?: string,
    ) => {
      const key =
        idempotencyKey ??
        createBookingMutationIdempotencyKey('no-show', bookingId, createBookingIdempotencyNonce());
      return run(
        () => api.bookings.markNoShow(orgId!, bookingId, reason ?? null, { idempotencyKey: key }),
        'Als No-Show markiert',
        onSuccess,
        () => {
          void invalidateVehicleOperationalAfterBookingChange({
            orgId: orgId!,
            vehicleId,
            reason: 'booking-no-show',
          });
        },
      );
    },
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
