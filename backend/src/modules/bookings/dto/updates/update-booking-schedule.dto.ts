import { IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { BookingUpdateConcurrencyDto } from './booking-update-concurrency.dto';

export class UpdateBookingScheduleDto extends BookingUpdateConcurrencyDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  pickupAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  returnAt?: string;

  /** @deprecated use pickupAt */
  @IsOptional()
  @IsISO8601({ strict: true })
  startDate?: string;

  /** @deprecated use returnAt */
  @IsOptional()
  @IsISO8601({ strict: true })
  endDate?: string;

  /** Required when schedule changes affect pricing — server validates quote. */
  @IsOptional()
  @IsUUID('4')
  pricingQuoteId?: string;

  /** @deprecated use pricingQuoteId */
  @IsOptional()
  @IsUUID('4')
  quoteId?: string;
}
