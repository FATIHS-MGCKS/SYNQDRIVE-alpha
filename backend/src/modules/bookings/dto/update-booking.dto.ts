import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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

const BOOKING_UPDATE_STATUSES = ['PENDING', 'CONFIRMED'] as const;

/**
 * Validated HTTP body for `PATCH /organizations/:orgId/bookings/:id`.
 * Flat scalar fields only — lifecycle timestamps and relations are server-owned.
 */
export class UpdateBookingDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  kmIncluded?: number;

  @IsOptional()
  @IsIn(BOOKING_UPDATE_STATUSES)
  status?: (typeof BOOKING_UPDATE_STATUSES)[number];

  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @IsOptional()
  @IsUUID('4')
  customerId?: string;

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
  @IsUUID('4')
  actualPickupStationId?: string;

  @IsOptional()
  @IsUUID('4')
  actualReturnStationId?: string;

  @IsOptional()
  @IsBoolean()
  isOneWayRental?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  stationTransferFeeCents?: number;

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
}
