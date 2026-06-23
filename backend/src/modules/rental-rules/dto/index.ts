import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  RentalAdditionalDriverPolicy,
  RentalForeignTravelPolicy,
  RentalVehicleCategoryType,
  RentalYoungDriverPolicy,
} from '@prisma/client';

export class RentalRuleFieldsDto {
  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(99)
  minimumAgeYears?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  minimumLicenseHoldingMonths?: number | null;

  /** Convenience: whole years; stored as months (×12). Ignored when minimumLicenseHoldingMonths is set. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(80)
  minimumLicenseHoldingYears?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  depositAmountCents?: number | null;

  /** Alias for depositAmountCents (minor currency units, consistent with pricing module). */
  @IsOptional()
  @IsInt()
  @Min(0)
  depositAmount?: number | null;

  @IsOptional()
  @IsString()
  depositCurrency?: string | null;

  @IsOptional()
  @IsBoolean()
  creditCardRequired?: boolean | null;

  @IsOptional()
  @IsEnum(RentalForeignTravelPolicy)
  foreignTravelPolicy?: RentalForeignTravelPolicy | null;

  @IsOptional()
  @IsEnum(RentalAdditionalDriverPolicy)
  additionalDriverPolicy?: RentalAdditionalDriverPolicy | null;

  @IsOptional()
  @IsEnum(RentalYoungDriverPolicy)
  youngDriverPolicy?: RentalYoungDriverPolicy | null;

  @IsOptional()
  @IsString()
  insuranceRequirement?: string | null;

  @IsOptional()
  @IsBoolean()
  manualApprovalRequired?: boolean | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpsertOrganizationRentalRulesDto extends RentalRuleFieldsDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateRentalVehicleCategoryDto extends RentalRuleFieldsDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(RentalVehicleCategoryType)
  type?: RentalVehicleCategoryType;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateRentalVehicleCategoryDto extends RentalRuleFieldsDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(RentalVehicleCategoryType)
  type?: RentalVehicleCategoryType;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignCategoryVehiclesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  vehicleIds!: string[];
}

export class UpsertVehicleRentalOverridesDto extends RentalRuleFieldsDto {}
