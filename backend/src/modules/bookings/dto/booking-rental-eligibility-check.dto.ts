import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { BOOKING_CHECKOUT_PAYMENT_INTENTS } from '../booking-payment-intent.types';

export class BookingRentalEligibilityCheckDto {
  @IsUUID('4')
  vehicleId!: string;

  @IsUUID('4')
  customerId!: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn([...BOOKING_CHECKOUT_PAYMENT_INTENTS])
  paymentIntent?: (typeof BOOKING_CHECKOUT_PAYMENT_INTENTS)[number];

  /** @deprecated use paymentIntent */
  @IsOptional()
  @IsIn([...BOOKING_CHECKOUT_PAYMENT_INTENTS])
  paymentMethod?: (typeof BOOKING_CHECKOUT_PAYMENT_INTENTS)[number];

  @IsOptional()
  @IsBoolean()
  foreignTravelRequested?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  additionalDriverCount?: number;

  @IsOptional()
  @IsBoolean()
  depositReceived?: boolean;
}

export class BookingRentalEligibilityBookingQueryDto {
  @IsOptional()
  @IsIn([...BOOKING_CHECKOUT_PAYMENT_INTENTS])
  paymentIntent?: (typeof BOOKING_CHECKOUT_PAYMENT_INTENTS)[number];

  /** @deprecated use paymentMethod */
  @IsOptional()
  @IsIn([...BOOKING_CHECKOUT_PAYMENT_INTENTS])
  paymentMethod?: (typeof BOOKING_CHECKOUT_PAYMENT_INTENTS)[number];

  @IsOptional()
  @IsBoolean()
  foreignTravelRequested?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  additionalDriverCount?: number;

  @IsOptional()
  @IsBoolean()
  depositReceived?: boolean;
}
