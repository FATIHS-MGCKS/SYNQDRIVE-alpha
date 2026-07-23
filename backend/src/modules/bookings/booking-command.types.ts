import type { BookingStatus, BookingPaymentIntent } from '@prisma/client';
import type { BookingPricingInputDto } from '@modules/pricing/dto';
import type { BookingCheckoutPaymentIntent } from './booking-payment-intent.types';

/** Client-allowed statuses when creating a booking via HTTP API. */
export type BookingCreateStatus = Extract<BookingStatus, 'PENDING' | 'CONFIRMED'>;

/** Client-allowed statuses when patching a booking via HTTP API. */
export type BookingUpdateStatus = Extract<
  BookingStatus,
  'PENDING' | 'CONFIRMED'
>;

/**
 * Explicit domain command for booking creation.
 * Prices are never accepted from the client — only server pricing quotes apply.
 */
export interface CreateBookingCommand {
  customerId: string;
  vehicleId: string;
  pickupAt: Date;
  returnAt: Date;
  pricingQuoteId: string;
  pickupStationId?: string;
  returnStationId?: string;
  pickupAddressOverride?: string;
  returnAddressOverride?: string;
  customerNotes?: string;
  internalNotes?: string;
  status?: BookingCreateStatus;
  paymentIntent?: BookingCheckoutPaymentIntent;
  kmIncluded?: number;
  currency?: string;
  insuranceOptions?: string[];
  extrasJson?: unknown;
  pricingInput?: BookingPricingInputDto;
  allowedDriverIds?: string[];
  isOneWayRental?: boolean;
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
