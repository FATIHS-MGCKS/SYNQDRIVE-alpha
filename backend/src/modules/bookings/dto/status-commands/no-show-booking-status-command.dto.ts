import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Body for `POST .../bookings/:id/status/no-show`. */
export class NoShowBookingStatusCommandDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string | null;
}
