import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Validated HTTP body for `POST /organizations/:orgId/bookings/:id/no-show`. */
export class MarkBookingNoShowDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string | null;
}
