import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  BOOKING_CANCELLATION_REASON_CODES,
  type BookingCancellationReasonCode,
} from '../../cancellation/booking-cancellation-reason.codes';

/** Body for `POST .../bookings/:id/status/cancel`. */
export class CancelBookingStatusCommandDto {
  @IsEnum(BOOKING_CANCELLATION_REASON_CODES)
  reasonCode!: BookingCancellationReasonCode;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  /** Effective cancellation timestamp (defaults to server now when omitted). */
  @IsOptional()
  @IsDateString()
  effectiveAt?: string;
}
