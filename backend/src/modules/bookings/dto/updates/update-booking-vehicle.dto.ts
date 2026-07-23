import { IsOptional, IsUUID } from 'class-validator';
import { BookingUpdateConcurrencyDto } from './booking-update-concurrency.dto';

export class UpdateBookingVehicleDto extends BookingUpdateConcurrencyDto {
  @IsUUID('4')
  vehicleId!: string;

  @IsOptional()
  @IsUUID('4')
  pricingQuoteId?: string;

  /** @deprecated use pricingQuoteId */
  @IsOptional()
  @IsUUID('4')
  quoteId?: string;
}
