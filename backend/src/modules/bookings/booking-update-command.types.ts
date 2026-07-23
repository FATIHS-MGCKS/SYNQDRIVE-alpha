import type { BookingPricingInputDto } from '@modules/pricing/dto';

export interface BookingUpdateContext {
  userId?: string | null;
  hasOverridePermission?: boolean;
  idempotencyKey?: string | null;
}

export interface UpdateBookingScheduleCommand {
  expectedUpdatedAt: Date;
  allowTerminalOverride?: boolean;
  pickupAt?: Date;
  returnAt?: Date;
  pricingQuoteId?: string;
}

export interface UpdateBookingCustomerCommand {
  expectedUpdatedAt: Date;
  allowTerminalOverride?: boolean;
  customerId: string;
}

export interface UpdateBookingVehicleCommand {
  expectedUpdatedAt: Date;
  allowTerminalOverride?: boolean;
  vehicleId: string;
  pricingQuoteId?: string;
}

export interface UpdateBookingStationsCommand {
  expectedUpdatedAt: Date;
  allowTerminalOverride?: boolean;
  pickupStationId?: string | null;
  returnStationId?: string | null;
  pickupAddressOverride?: string | null;
  returnAddressOverride?: string | null;
  isOneWayRental?: boolean;
}

export interface UpdateBookingNotesCommand {
  expectedUpdatedAt: Date;
  customerNotes?: string;
  internalNotes?: string;
}

export interface UpdateBookingOptionsCommand {
  expectedUpdatedAt: Date;
  allowTerminalOverride?: boolean;
  pricingInput?: BookingPricingInputDto;
  pricingQuoteId?: string;
  kmIncluded?: number;
  insuranceOptions?: string[];
  extrasJson?: unknown;
}

export interface UpdateBookingAllowedDriversCommand {
  expectedUpdatedAt: Date;
  allowTerminalOverride?: boolean;
  allowedDriverIds: string[];
  primaryDriverId?: string;
}
