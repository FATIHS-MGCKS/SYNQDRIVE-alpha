import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BookingPricingInputDto } from '@modules/pricing/dto';

const BOOKING_CREATE_STATUSES = ['PENDING', 'CONFIRMED'] as const;

/**
 * Validated HTTP body for `POST /organizations/:orgId/bookings`.
 * Flat scalar fields only — no Prisma relation shapes.
 */
export class CreateBookingDto {
  @IsUUID('4')
  customerId!: string;

  @IsUUID('4')
  vehicleId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsUUID('4')
  quoteId!: string;

  @IsOptional()
  @IsUUID('4')
  pickupStationId?: string;

  @IsOptional()
  @IsUUID('4')
  returnStationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  pickupAddressOverride?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  returnAddressOverride?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  notes?: string;

  @IsOptional()
  @IsIn(BOOKING_CREATE_STATUSES)
  status?: (typeof BOOKING_CREATE_STATUSES)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  kmIncluded?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  insuranceOptions?: string[];

  @IsOptional()
  extrasJson?: unknown;

  @IsOptional()
  @ValidateNested()
  @Type(() => BookingPricingInputDto)
  pricingInput?: BookingPricingInputDto;

  /** Legacy hint — server pricing quote is authoritative. */
  @IsOptional()
  @IsInt()
  @Min(0)
  dailyRateCents?: number;

  /** Legacy hint — server pricing quote is authoritative. */
  @IsOptional()
  @IsInt()
  @Min(0)
  totalPriceCents?: number;
}
