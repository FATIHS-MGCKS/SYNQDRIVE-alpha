import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { BookingStatus } from '@prisma/client';

/** Body for `POST .../bookings/:id/status/override`. */
export class AdminOverrideBookingStatusDto {
  @IsEnum(BookingStatus)
  toStatus!: BookingStatus;

  @IsString()
  @MinLength(10)
  reason!: string;
}
