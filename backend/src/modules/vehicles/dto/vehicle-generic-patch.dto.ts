import { Type } from 'class-transformer';
import {
  DriveType,
  FuelType,
  HardwareType,
  TransmissionType,
  VehicleType,
} from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Whitelisted master-data fields for generic vehicle PATCH.
 *
 * Operational fields (`status`, `cleaningStatus`, `healthStatus`) and relation
 * keys are intentionally excluded — use dedicated endpoints.
 * Global ValidationPipe (`forbidNonWhitelisted`) rejects unknown properties.
 */
export class VehicleGenericPatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  vin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  make?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicleName?: string | null;

  @IsOptional()
  @IsEnum(FuelType)
  fuelType?: FuelType;

  @IsOptional()
  @IsEnum(TransmissionType)
  transmission?: TransmissionType | null;

  @IsOptional()
  @IsEnum(DriveType)
  driveType?: DriveType | null;

  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType | null;

  @IsOptional()
  @IsEnum(HardwareType)
  hardwareType?: HardwareType;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  licensePlate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  mileageKm?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dailyRateEur?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weeklyRateEur?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyRateEur?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  extraKmPrice?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  billingExcluded?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  leasingRateCents?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  insuranceCostCents?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  taxCostCents?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  curbWeightKg?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  frontWeightDistributionPct?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  idleRpm?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxRpm?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  serviceIntervalKm?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  serviceIntervalMonths?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  brakeForceFrontPercent?: number | null;

  @IsOptional()
  @IsDateString()
  lastServiceDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lastServiceOdometerKm?: number | null;

  @IsOptional()
  @IsDateString()
  nextServiceDueDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  serviceIntervalManufacturerKm?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  serviceIntervalManufacturerMonths?: number | null;

  @IsOptional()
  @IsDateString()
  lastOilChangeDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lastOilChangeOdometerKm?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  oilChangeIntervalKm?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  oilChangeIntervalMonths?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hvBatteryCapacityKwh?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tankCapacityLiters?: number | null;

  @IsOptional()
  @IsDateString()
  lastTuvDate?: string | null;

  @IsOptional()
  @IsDateString()
  nextTuvDate?: string | null;

  @IsOptional()
  @IsDateString()
  lastBokraftDate?: string | null;

  @IsOptional()
  @IsDateString()
  nextBokraftDate?: string | null;
}
