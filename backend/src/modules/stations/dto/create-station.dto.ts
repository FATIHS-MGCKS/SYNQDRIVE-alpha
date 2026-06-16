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
} from 'class-validator';
import { StationStatus, StationType } from '@prisma/client';

export class CreateStationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @IsOptional()
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
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  longitude?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
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
  @IsInt()
  @Min(0)
  capacity?: number | null;

  @IsOptional()
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
