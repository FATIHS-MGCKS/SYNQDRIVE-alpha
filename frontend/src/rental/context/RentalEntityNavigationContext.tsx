import { createContext, useContext, type ReactNode } from 'react';
import type { VehicleDetailTab } from '../lib/vehicle-overview.types';

export interface RentalEntityNavigationValue {
  openVehicleById: (vehicleId: string, tab?: VehicleDetailTab) => void;
  openBookingById: (bookingId: string) => void;
  openCustomerById: (customerId: string) => void;
  openInvoiceById: (invoiceId: string) => void;
  openDocumentById: (
    documentId: string,
    options?: { vehicleId?: string | null; module?: string | null },
  ) => void;
  openDocumentIntake: (
    request: import('../lib/document-intake-entry').DocumentIntakeEntryRequest,
  ) => void;
  openAlertById: (alertId: string, options?: { vehicleId?: string | null }) => void;
  openServiceCaseById: (serviceCaseId: string, options?: { vehicleId?: string | null }) => void;
  openFineById: (fineId: string) => void;
  openVendorById: (vendorId: string) => void;
}

const noop = () => undefined;

const defaultValue: RentalEntityNavigationValue = {
  openVehicleById: noop,
  openBookingById: noop,
  openCustomerById: noop,
  openInvoiceById: noop,
  openDocumentById: noop,
  openDocumentIntake: noop,
  openAlertById: noop,
  openServiceCaseById: noop,
  openFineById: noop,
  openVendorById: noop,
};

const RentalEntityNavigationContext = createContext<RentalEntityNavigationValue>(defaultValue);

export function RentalEntityNavigationProvider({
  value,
  children,
}: {
  value: RentalEntityNavigationValue;
  children: ReactNode;
}) {
  return (
    <RentalEntityNavigationContext.Provider value={value}>
      {children}
    </RentalEntityNavigationContext.Provider>
  );
}

export function useRentalEntityNavigation(): RentalEntityNavigationValue {
  return useContext(RentalEntityNavigationContext);
}
