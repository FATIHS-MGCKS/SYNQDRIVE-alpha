import { IsOptional, IsString, MaxLength } from 'class-validator';
import { BookingUpdateConcurrencyDto } from './booking-update-concurrency.dto';

export class UpdateBookingNotesDto extends BookingUpdateConcurrencyDto {
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
}
