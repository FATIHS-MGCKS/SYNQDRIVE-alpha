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

  @IsOptional()
  @IsBoolean()
  privacyAccepted?: boolean;

  @IsOptional()
  @IsString()
  status?: 'PENDING' | 'CONFIRMED';

  @IsOptional()
  @IsIn(['card', 'cash', 'invoice'])
  paymentMethod?: 'card' | 'cash' | 'invoice';
}
