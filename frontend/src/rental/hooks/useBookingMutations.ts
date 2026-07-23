import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { api, type OperatorBookingUpdatePayload } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import { invalidateBookingsList } from '../lib/bookings-invalidation';
import { invalidateVehicleOperationalAfterBookingChange } from '../lib/vehicle-operational-query';
import {
  buildBookingUpdateCommand,
  formatBookingMutationError,
  type BookingEditBaseline,
  type BookingEditFormState,
  type BookingMutationErrorView,
} from '../lib/booking-commands';

function resolveVehicleIdFromUpdatePayload(
  payload: OperatorBookingUpdatePayload,
  fallbackVehicleId?: string | null,
): string | null {
  if (payload.vehicle?.connect?.id) return payload.vehicle.connect.id;
  if (payload.vehicleId) return payload.vehicleId;
  return fallbackVehicleId ?? null;
}

export interface BookingMutationSuccessContext {
  bookingId: string;
  response: unknown;
}

export function useBookingMutations() {
  const { orgId } = useRentalOrg();
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<BookingMutationErrorView | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const reportError = useCallback((err: unknown, fallback?: string): BookingMutationErrorView => {
    const view = formatBookingMutationError(err, fallback);
    setError(view);
    toast.error(view.title, { description: view.description });
    return view;
  }, []);

  const updateBookingFields = useCallback(
    async (
      baseline: BookingEditBaseline,
      form: BookingEditFormState,
      options?: {
        allowVehicleChange?: boolean;
        allowCustomerChange?: boolean;
        previousVehicleId?: string | null;
        onSuccess?: (ctx: BookingMutationSuccessContext) => void | Promise<void>;
      },
    ): Promise<BookingMutationSuccessContext | null> => {
      if (!orgId) {
        reportError(new Error('Organisation nicht geladen'));
        return null;
      }
      if (mutating) return null;

      const command = buildBookingUpdateCommand(baseline, form, {
        allowVehicleChange: options?.allowVehicleChange,
        allowCustomerChange: options?.allowCustomerChange,
      });
      if (!command.ok) {
        const view: BookingMutationErrorView = {
          kind: 'validation',
          title: 'Eingabe unvollständig',
          description: command.error,
        };
        setError(view);
        toast.error(view.title, { description: view.description });
        return null;
      }

      setMutating(true);
      setError(null);
      try {
        const response = await api.bookings.update(orgId, baseline.bookingId, command.patch);
        invalidateBookingsList();
        const nextVehicleId = resolveVehicleIdFromUpdatePayload(
          command.patch,
          options?.previousVehicleId ?? baseline.vehicleId,
        );
        await invalidateVehicleOperationalAfterBookingChange({
          orgId,
          vehicleId: nextVehicleId,
          previousVehicleId: options?.previousVehicleId ?? baseline.vehicleId,
          reason: 'booking-updated',
        });
        toast.success('Buchung gespeichert');
        const ctx: BookingMutationSuccessContext = { bookingId: baseline.bookingId, response };
        await options?.onSuccess?.(ctx);
        return ctx;
      } catch (err) {
        reportError(err, 'Speichern fehlgeschlagen');
        return null;
      } finally {
        setMutating(false);
      }
    },
    [orgId, mutating, reportError],
  );

  const cancelBooking = useCallback(
    async (
      bookingId: string,
      options?: {
        vehicleId?: string | null;
        onSuccess?: () => void | Promise<void>;
      },
    ): Promise<boolean> => {
      if (!orgId) {
        reportError(new Error('Organisation nicht geladen'));
        return false;
      }
      if (mutating) return false;

      setMutating(true);
      setError(null);
      try {
        await api.bookings.cancel(orgId, bookingId);
        invalidateBookingsList();
        await invalidateVehicleOperationalAfterBookingChange({
          orgId,
          vehicleId: options?.vehicleId ?? null,
          reason: 'booking-cancelled',
        });
        toast.success('Buchung storniert');
        await options?.onSuccess?.();
        return true;
      } catch (err) {
        reportError(err, 'Stornierung fehlgeschlagen');
        return false;
      } finally {
        setMutating(false);
      }
    },
    [orgId, mutating, reportError],
  );

  const markNoShow = useCallback(
    async (
      bookingId: string,
      options?: {
        reason?: string | null;
        vehicleId?: string | null;
        onSuccess?: () => void | Promise<void>;
      },
    ): Promise<boolean> => {
      if (!orgId) {
        reportError(new Error('Organisation nicht geladen'));
        return false;
      }
      if (mutating) return false;

      setMutating(true);
      setError(null);
      try {
        await api.bookings.markNoShow(orgId, bookingId, options?.reason ?? null);
        invalidateBookingsList();
        await invalidateVehicleOperationalAfterBookingChange({
          orgId,
          vehicleId: options?.vehicleId ?? null,
          reason: 'booking-no-show',
        });
        toast.success('Als No-Show markiert');
        await options?.onSuccess?.();
        return true;
      } catch (err) {
        reportError(err, 'No-Show konnte nicht gesetzt werden');
        return false;
      } finally {
        setMutating(false);
      }
    },
    [orgId, mutating, reportError],
  );

  return {
    mutating,
    error,
    clearError,
    updateBookingFields,
    cancelBooking,
    markNoShow,
  };
}
