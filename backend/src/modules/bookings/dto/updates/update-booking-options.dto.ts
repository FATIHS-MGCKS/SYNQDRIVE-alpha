import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BookingPricingInputDto } from '@modules/pricing/dto';
import { BookingUpdateConcurrencyDto } from './booking-update-concurrency.dto';

export class UpdateBookingOptionsDto extends BookingUpdateConcurrencyDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => BookingPricingInputDto)
  pricingInput?: BookingPricingInputDto;

  @IsOptional()
  @IsUUID('4')
  pricingQuoteId?: string;

  /** @deprecated use pricingQuoteId */
  @IsOptional()
  @IsUUID('4')
  quoteId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  kmIncluded?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  insuranceOptions?: string[];

  @IsOptional()
  extrasJson?: unknown;
}
