import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Validate,
} from 'class-validator';
import { StationStatus, StationType } from '@prisma/client';
import {
  IsAllowedStationCreateStatus,
  IsStationCoordinatePair,
  IsStationCreateCapacity,
  IsStationIanaTimezone,
  IsValidStationOpeningHours,
  StationPickupReturnConsistentConstraint,
} from './station-create.dto.validators';

export class CreateStationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Validate(StationPickupReturnConsistentConstraint)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @IsOptional()
  @IsAllowedStationCreateStatus()
  @IsEnum(StationStatus)
  status?: StationStatus;

  @IsOptional()
  @IsEnum(StationType)
  type?: StationType;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsStationCoordinatePair()
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @IsStationIanaTimezone()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(25)
  @Max(5000)
  radiusMeters?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  managerName?: string;

  @IsOptional()
  @IsBoolean()
  pickupEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  returnEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  afterHoursReturnEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  keyBoxAvailable?: boolean;

  @IsOptional()
  @IsStationCreateCapacity()
  capacity?: number | null;

  @IsOptional()
  @IsValidStationOpeningHours()
  @IsObject()
  openingHours?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  holidayRules?: Record<string, unknown> | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  handoverInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  returnInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  googlePlaceId?: string;
}
