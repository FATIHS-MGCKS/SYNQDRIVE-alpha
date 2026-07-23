import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { BookingUpdateConcurrencyDto } from './booking-update-concurrency.dto';

export class UpdateBookingStationsDto extends BookingUpdateConcurrencyDto {
  @IsOptional()
  @IsUUID('4')
  pickupStationId?: string | null;

  @IsOptional()
  @IsUUID('4')
  returnStationId?: string | null;

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
}
