import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { VendorVehicleRelationType } from '@prisma/client';

/** Link a vehicle to a vendor with a typed relationship + optional metadata. */
export class LinkVendorVehicleDto {
  @IsUUID()
  @IsNotEmpty()
  vehicleId!: string;

  @IsOptional()
  @IsEnum(VendorVehicleRelationType)
  relationType?: VendorVehicleRelationType;

  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/**
 * Update an existing vendor↔vehicle link. The vehicle cannot be reassigned
 * (delete + re-link instead); only link metadata is mutable here.
 */
export class UpdateVendorVehicleLinkDto {
  @IsOptional()
  @IsEnum(VendorVehicleRelationType)
  relationType?: VendorVehicleRelationType;

  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
