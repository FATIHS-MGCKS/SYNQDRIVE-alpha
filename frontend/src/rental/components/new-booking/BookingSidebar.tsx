import { BookingRentalEligibilityCard } from '../bookings/BookingRentalEligibilityCard';
import { BookingSummaryPanel } from './BookingSummaryPanel';
import type { BookingSidebarProps } from './types';

export function BookingSidebar({
  rentalEligibility,
  rentalEligibilityLoading,
  rentalEligibilityError,
  onCompleteCustomerData,
  onChooseAnotherVehicle,
  selectedVehicle,
  selectedCustomer,
  pickupDate,
  ...summaryProps
}: BookingSidebarProps) {
  return (
    <div className="min-w-0 space-y-5">
      {selectedVehicle && selectedCustomer && pickupDate && (
        <BookingRentalEligibilityCard
          result={rentalEligibility}
          loading={rentalEligibilityLoading}
          error={rentalEligibilityError}
          onCompleteCustomerData={onCompleteCustomerData}
          onChooseAnotherVehicle={onChooseAnotherVehicle}
        />
      )}
      <BookingSummaryPanel
        selectedVehicle={selectedVehicle}
        selectedCustomer={selectedCustomer}
        pickupDate={pickupDate}
        {...summaryProps}
      />
    </div>
  );
}
