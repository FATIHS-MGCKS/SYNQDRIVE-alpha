import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { BookingPricingInputDto } from '@modules/pricing/dto';
import { BOOKING_CHECKOUT_PAYMENT_INTENTS } from '../booking-payment-intent.types';

const PATCH_STATUSES = ['PENDING', 'CONFIRMED', 'ACTIVE'] as const;

export class UpdateBookingDto {
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsUUID('4')
  quoteId?: string;

  @IsOptional()
  @IsIn([...PATCH_STATUSES])
  status?: (typeof PATCH_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @IsOptional()
  @IsIn([...BOOKING_CHECKOUT_PAYMENT_INTENTS])
  paymentIntent?: (typeof BOOKING_CHECKOUT_PAYMENT_INTENTS)[number];

  @IsOptional()
  @IsUUID('4')
  pickupStationId?: string | null;

  @IsOptional()
  @IsUUID('4')
  returnStationId?: string | null;

  @IsOptional()
  @IsUUID('4')
  assignedDriverId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  pickupAddressOverride?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  returnAddressOverride?: string | null;

  @IsOptional()
  @IsBoolean()
  isOneWayRental?: boolean;

  @IsOptional()
  insuranceOptions?: unknown;

  @IsOptional()
  extrasJson?: unknown;

  @IsOptional()
  @ValidateNested()
  @Type(() => BookingPricingInputDto)
  pricingInput?: BookingPricingInputDto;

  @IsOptional()
  @IsUUID('4')
  eligibilityApprovalId?: string;

  @IsOptional()
  @IsString()
  eligibilityPreviewFingerprint?: string;

  @IsOptional()
  @IsBoolean()
  foreignTravelRequested?: boolean;

  @IsOptional()
  additionalDriverCount?: number;
}
