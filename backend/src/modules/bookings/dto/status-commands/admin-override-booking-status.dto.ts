import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { BookingStatus } from '@prisma/client';
import {
  BOOKING_STATUS_OVERRIDE_INVARIANTS,
  type BookingStatusOverrideInvariant,
} from '../../override/booking-status-override-invariants';

/** Body for `POST .../bookings/:id/status/override`. */
export class AdminOverrideBookingStatusDto {
  @IsEnum(BookingStatus)
  toStatus!: BookingStatus;

  @IsString()
  @MinLength(10)
  reason!: string;

  /** Explicit invariant classification for audit (defaults inferred server-side when omitted). */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(BOOKING_STATUS_OVERRIDE_INVARIANTS, { each: true })
  affectedInvariants?: BookingStatusOverrideInvariant[];

  /**
   * Optional workflow approval reference for four-eyes preparation.
   * When set, must reference an existing `OrgWorkflowApproval` row.
   */
  @IsOptional()
  @IsUUID()
  approvalRequestId?: string;
}
