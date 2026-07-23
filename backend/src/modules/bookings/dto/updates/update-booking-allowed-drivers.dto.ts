import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsUUID } from 'class-validator';
import { BookingUpdateConcurrencyDto } from './booking-update-concurrency.dto';

export class UpdateBookingAllowedDriversDto extends BookingUpdateConcurrencyDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  allowedDriverIds!: string[];

  @IsOptional()
  @IsUUID('4')
  primaryDriverId?: string;
}
