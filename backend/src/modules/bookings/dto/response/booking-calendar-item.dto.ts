import type { BookingHandoverSummaryDto } from './booking-handover.dto';

export interface BookingCalendarItemDto {
  id: string;
  bookingNumber: string;
  vehicleId: string;
  customerId: string;
  customerName: string;
  vehicleName: string;
  vehicleLicense: string;
  startDate: string;
  endDate: string;
  statusEnum: string;
  pickupStationId: string | null;
  returnStationId: string | null;
  pickupStationName: string;
  returnStationName: string;
  pickupHandover: BookingHandoverSummaryDto | null;
  returnHandover: BookingHandoverSummaryDto | null;
  isOneWayRental: boolean;
}
