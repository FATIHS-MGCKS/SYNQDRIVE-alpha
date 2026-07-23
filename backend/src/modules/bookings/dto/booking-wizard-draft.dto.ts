import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { BookingPricingInputDto } from '@modules/pricing/dto';
import { BOOKING_CHECKOUT_PAYMENT_INTENTS } from '../booking-payment-intent.types';

export class BookingWizardEligibilityPreviewQueryDto {
  @IsOptional()
  @IsIn([...BOOKING_CHECKOUT_PAYMENT_INTENTS])
  paymentIntent?: (typeof BOOKING_CHECKOUT_PAYMENT_INTENTS)[number];

  /** @deprecated use paymentIntent */
  @IsOptional()
  @IsIn([...BOOKING_CHECKOUT_PAYMENT_INTENTS])
  paymentMethod?: (typeof BOOKING_CHECKOUT_PAYMENT_INTENTS)[number];

  @IsOptional()
  @IsIn(['PENDING', 'CONFIRMED'])
  targetStatus?: 'PENDING' | 'CONFIRMED';

  @IsOptional()
  @IsString()
  eligibilityApprovalId?: string;
}

export class BookingWizardDraftBodyDto {
  @IsUUID('4')
  vehicleId!: string;

  @IsUUID('4')
  customerId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsUUID('4')
  quoteId!: string;

  @IsOptional()
  @IsUUID('4')
  existingBookingId?: string;

  @IsOptional()
  @IsUUID('4')
  pickupStationId?: string;

  @IsOptional()
  @IsUUID('4')
  returnStationId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BookingPricingInputDto)
  pricingInput?: BookingPricingInputDto;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BookingWizardDraftUpdateDto {
  @IsUUID('4')
  quoteId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BookingPricingInputDto)
  pricingInput?: BookingPricingInputDto;
}

export class BookingWizardDraftConfirmDto {
  @IsOptional()
  @IsBoolean()
  agbAccepted?: boolean;

  /**
   * @deprecated Checkout UI flag only — not stored as GDPR consent.
   * Server records `PRIVACY_NOTICE_ACKNOWLEDGMENT` in `booking_legal_acceptances`
   * when frozen privacy document refs + checksum exist.
   */
  @IsOptional()
  @IsBoolean()
  privacyAccepted?: boolean;

  @IsOptional()
  @IsString()
  status?: 'PENDING' | 'CONFIRMED';

  @IsOptional()
  @IsIn([...BOOKING_CHECKOUT_PAYMENT_INTENTS])
  paymentIntent?: (typeof BOOKING_CHECKOUT_PAYMENT_INTENTS)[number];

  /** @deprecated use paymentIntent */
  @IsOptional()
  @IsIn([...BOOKING_CHECKOUT_PAYMENT_INTENTS])
  paymentMethod?: (typeof BOOKING_CHECKOUT_PAYMENT_INTENTS)[number];

  @IsOptional()
  @IsUUID('4')
  eligibilityApprovalId?: string;

  @IsOptional()
  @IsString()
  eligibilityPreviewFingerprint?: string;
}
