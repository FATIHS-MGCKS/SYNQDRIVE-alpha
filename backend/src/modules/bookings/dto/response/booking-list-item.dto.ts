import type { BookingHandoverSummaryDto } from './booking-handover.dto';

export interface BookingListItemDto {
  id: string;
  bookingNumber: string;
  vehicleId: string;
  customerId: string;
  pickupStationId: string | null;
  returnStationId: string | null;
  customerName: string;
  vehicleName: string;
  vehicleLicense: string;
  pickupStationName: string;
  returnStationName: string;
  startDate: string;
  endDate: string;
  status: string;
  statusEnum: string;
  totalPriceCents: number | null;
  currency: string;
  kmIncluded: number;
  kmDriven: number;
  pickupHandover: BookingHandoverSummaryDto | null;
  returnHandover: BookingHandoverSummaryDto | null;
  isOneWayRental: boolean;
  actualPickupStationId: string | null;
  actualReturnStationId: string | null;
}
