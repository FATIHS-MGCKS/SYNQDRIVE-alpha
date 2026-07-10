import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PriceOptionPricingType } from '@prisma/client';

export class CreateTariffGroupDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateTariffGroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class TariffRateDto {
  @IsInt()
  @Min(1)
  dailyRateCents!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  weeklyRateCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyRateCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  includedKmPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  extraKmPriceCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  depositAmountCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minimumRentalDays?: number;
}

export class MileagePackageDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  label!: string;

  @IsInt()
  @Min(1)
  includedKm!: number;

  @IsInt()
  @Min(0)
  priceCents!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class InsuranceOptionDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  label!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(0)
  priceCents!: number;

  @IsOptional()
  @IsEnum(PriceOptionPricingType)
  pricingType?: PriceOptionPricingType;

  @IsOptional()
  @IsInt()
  @Min(0)
  deductibleCents?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class ExtraOptionDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  label!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(0)
  priceCents!: number;

  @IsOptional()
  @IsEnum(PriceOptionPricingType)
  pricingType?: PriceOptionPricingType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class PublishTariffDraftDto {
  @IsUUID()
  draftVersionId!: string;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  /** Optimistic conflict check — rejects publish if draft versionNumber changed. */
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersionNumber?: number;
}

export class UpsertTariffVersionDto {
  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TariffRateDto)
  rate?: TariffRateDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MileagePackageDto)
  mileagePackages?: MileagePackageDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InsuranceOptionDto)
  insuranceOptions?: InsuranceOptionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtraOptionDto)
  extraOptions?: ExtraOptionDto[];
}

export class CreateVehicleAssignmentDto {
  @IsUUID()
  vehicleId!: string;

  @IsUUID()
  tariffGroupId!: string;

  @IsOptional()
  @IsISO8601()
  validFrom?: string;
}

export class SimulateBookingPriceDto {
  @IsUUID()
  vehicleId!: string;

  @IsISO8601()
  pickupAt!: string;

  @IsISO8601()
  returnAt!: string;

  @IsOptional()
  @IsUUID()
  selectedMileagePackageId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedInsuranceOptionIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedExtraOptionIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  manualDiscountCents?: number;

  @IsOptional()
  @IsInt()
  manualAdjustmentCents?: number;

  @IsOptional()
  @IsUUID()
  stationId?: string;

  /** Optional — when sent, must match server-resolved price book currency (no FX). */
  @IsOptional()
  @IsString()
  currency?: string;
}

export class BookingPricingInputDto {
  @IsOptional()
  @IsUUID()
  selectedMileagePackageId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedInsuranceOptionIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedExtraOptionIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  manualDiscountCents?: number;

  @IsOptional()
  @IsInt()
  manualAdjustmentCents?: number;
}
