import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useOperatorShell } from '../../../operator/context/OperatorShellContext';
import { useRentalEntityNavigation } from '../../../rental/context/RentalEntityNavigationContext';
import type { TaskDetailLinkedObjectModel } from '../taskDetailView.utils';
import {
  navigateTaskLinkedObject,
  type TaskLinkedObjectNavigationHandlers,
  type TaskLinkedObjectNavigationResult,
} from '../taskLinkedObjectNavigation';

function defaultBlocked(message: string) {
  toast.info(message);
}

export function useOperatorTaskLinkedObjectNavigation(): TaskLinkedObjectNavigationHandlers {
  const { setSelectedVehicleId, setActiveTab, setPendingTasksBookingId } = useOperatorShell();

  return useMemo(
    () => ({
      surface: 'operator',
      openVehicle: (vehicleId) => {
        setSelectedVehicleId(vehicleId);
        setActiveTab('vehicles');
      },
      openBooking: (bookingId) => {
        setPendingTasksBookingId(bookingId);
        setActiveTab('tasks');
      },
      onBlocked: defaultBlocked,
    }),
    [setActiveTab, setPendingTasksBookingId, setSelectedVehicleId],
  );
}

export function useRentalTaskLinkedObjectNavigation(): TaskLinkedObjectNavigationHandlers {
  const navigation = useRentalEntityNavigation();

  return useMemo(
    () => ({
      surface: 'rental',
      openVehicle: navigation.openVehicleById,
      openBooking: navigation.openBookingById,
      openCustomer: navigation.openCustomerById,
      openInvoice: navigation.openInvoiceById,
      openDocument: navigation.openDocumentById,
      openAlert: navigation.openAlertById,
      openServiceCase: navigation.openServiceCaseById,
      openFine: navigation.openFineById,
      openVendor: navigation.openVendorById,
      onBlocked: defaultBlocked,
    }),
    [navigation],
  );
}

export function useTaskLinkedObjectNavigator(
  handlers: TaskLinkedObjectNavigationHandlers,
  options?: { taskVehicleId?: string | null; onNavigated?: () => void },
) {
  return useCallback(
    (object: TaskDetailLinkedObjectModel): TaskLinkedObjectNavigationResult => {
      const result = navigateTaskLinkedObject(object, handlers, {
        taskVehicleId: options?.taskVehicleId ?? null,
      });
      if (result.navigated) {
        options?.onNavigated?.();
      }
      return result;
    },
    [handlers, options?.onNavigated, options?.taskVehicleId],
  );
}
