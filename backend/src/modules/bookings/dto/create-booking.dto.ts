import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BookingPricingInputDto } from '@modules/pricing/dto';
import { BOOKING_CHECKOUT_PAYMENT_INTENTS } from '../booking-payment-intent.types';

const BOOKING_CREATE_STATUSES = ['PENDING', 'CONFIRMED'] as const;

/**
 * Validated HTTP body for `POST /organizations/:orgId/bookings`.
 * Flat scalar fields only — no Prisma relation shapes.
 *
 * Canonical fields: pickupAt, returnAt, pricingQuoteId, customerNotes, internalNotes.
 * Legacy aliases remain accepted: startDate, endDate, quoteId, notes.
 */
export class CreateBookingDto {
  @IsUUID('4')
  customerId!: string;

  @IsUUID('4')
  vehicleId!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  pickupAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  returnAt?: string;

  @IsOptional()
  @IsUUID('4')
  pricingQuoteId?: string;

  /** @deprecated use pickupAt */
  @IsOptional()
  @IsISO8601({ strict: true })
  startDate?: string;

  /** @deprecated use returnAt */
  @IsOptional()
  @IsISO8601({ strict: true })
  endDate?: string;

  /** @deprecated use pricingQuoteId */
  @IsOptional()
  @IsUUID('4')
  quoteId?: string;

  @IsOptional()
  @IsUUID('4')
  pickupStationId?: string;

  @IsOptional()
  @IsUUID('4')
  returnStationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  pickupAddressOverride?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  returnAddressOverride?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  customerNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  internalNotes?: string;

  /** @deprecated use customerNotes */
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  notes?: string;

  @IsOptional()
  @IsIn(BOOKING_CREATE_STATUSES)
  status?: (typeof BOOKING_CREATE_STATUSES)[number];

  @IsOptional()
  @IsIn([...BOOKING_CHECKOUT_PAYMENT_INTENTS])
  paymentIntent?: (typeof BOOKING_CHECKOUT_PAYMENT_INTENTS)[number];

  /** Alias for paymentIntent */
  @IsOptional()
  @IsIn([...BOOKING_CHECKOUT_PAYMENT_INTENTS])
  paymentMethodIntent?: (typeof BOOKING_CHECKOUT_PAYMENT_INTENTS)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  kmIncluded?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  insuranceOptions?: string[];

  @IsOptional()
  extrasJson?: unknown;

  @IsOptional()
  @ValidateNested()
  @Type(() => BookingPricingInputDto)
  pricingInput?: BookingPricingInputDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  allowedDriverIds?: string[];

  @IsOptional()
  @IsBoolean()
  isOneWayRental?: boolean;
}
