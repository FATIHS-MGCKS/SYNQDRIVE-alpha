import type { BookingStatus, BookingPaymentIntent } from '@prisma/client';
import type { BookingPricingInputDto } from '@modules/pricing/dto';

/** Client-allowed statuses when creating a booking via HTTP API. */
export type BookingCreateStatus = Extract<BookingStatus, 'PENDING' | 'CONFIRMED'>;

/** Client-allowed statuses when patching a booking via HTTP API. */
export type BookingUpdateStatus = Extract<
  BookingStatus,
  'PENDING' | 'CONFIRMED'
>;

export interface CreateBookingCommand {
  customerId: string;
  vehicleId: string;
  startDate: Date;
  endDate: Date;
  quoteId: string;
  pickupStationId?: string;
  returnStationId?: string;
  pickupAddressOverride?: string;
  returnAddressOverride?: string;
  notes?: string;
  status?: BookingCreateStatus;
  kmIncluded?: number;
  currency?: string;
  insuranceOptions?: string[];
  extrasJson?: unknown;
  pricingInput?: BookingPricingInputDto;
  /** Legacy client hints — pricing service is source of truth. */
  dailyRateCents?: number;
  totalPriceCents?: number;
}

export interface UpdateBookingCommand {
  startDate?: Date;
  endDate?: Date;
  notes?: string;
  kmIncluded?: number;
  status?: BookingUpdateStatus;
  vehicleId?: string;
  customerId?: string;
  pickupStationId?: string;
  returnStationId?: string;
  pickupAddressOverride?: string;
  returnAddressOverride?: string;
  actualPickupStationId?: string;
  actualReturnStationId?: string;
  isOneWayRental?: boolean;
  stationTransferFeeCents?: number;
  insuranceOptions?: string[];
  extrasJson?: unknown;
  pricingInput?: BookingPricingInputDto;
  /** Internal service calls only (wizard confirm) — not accepted on HTTP PATCH. */
  paymentIntent?: BookingPaymentIntent;
}
