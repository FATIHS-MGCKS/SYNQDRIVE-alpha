import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  RentalAdditionalDriverPolicy,
  RentalForeignTravelPolicy,
  RentalVehicleCategoryStatus,
  RentalVehicleCategoryType,
  RentalYoungDriverPolicy,
} from '@prisma/client';
import { IsIso4217Currency } from '@shared/money/iso4217-currency.validator';
import { RENTAL_RULE_FIELD_KEYS } from '../rental-rules.types';
import {
  isRentalRuleSetValue,
  RENTAL_RULES_VALIDATION_LIMITS,
  RENTAL_RULES_VALIDATION_MESSAGE_KEYS as MSG,
} from '../rental-rules-validation.constants';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

const L = RENTAL_RULES_VALIDATION_LIMITS;

export class RentalRuleFieldsDto {
  @IsOptional()
  @ValidateIf((_o, value) => isRentalRuleSetValue(value))
  @IsInt({ message: MSG.minimumAgeYears.int })
  @Min(L.minimumAgeYears.min, { message: MSG.minimumAgeYears.min })
  @Max(L.minimumAgeYears.max, { message: MSG.minimumAgeYears.max })
  minimumAgeYears?: number | null;

  @IsOptional()
  @ValidateIf((_o, value) => isRentalRuleSetValue(value))
  @IsInt({ message: MSG.minimumLicenseHoldingMonths.int })
  @Min(L.minimumLicenseHoldingMonths.min, { message: MSG.minimumLicenseHoldingMonths.min })
  @Max(L.minimumLicenseHoldingMonths.max, { message: MSG.minimumLicenseHoldingMonths.max })
  minimumLicenseHoldingMonths?: number | null;

  /** Convenience: whole years; stored as months (×12). Ignored when minimumLicenseHoldingMonths is set. */
  @IsOptional()
  @ValidateIf((_o, value) => isRentalRuleSetValue(value))
  @IsInt({ message: MSG.minimumLicenseHoldingYears.int })
  @Min(L.minimumLicenseHoldingYearsAlias.min, { message: MSG.minimumLicenseHoldingYears.min })
  @Max(L.minimumLicenseHoldingYearsAlias.max, { message: MSG.minimumLicenseHoldingYears.max })
  minimumLicenseHoldingYears?: number | null;

  @IsOptional()
  @ValidateIf((_o, value) => isRentalRuleSetValue(value))
  @IsInt({ message: MSG.depositAmountCents.int })
  @Min(L.depositAmountCents.min, { message: MSG.depositAmountCents.min })
  @Max(L.depositAmountCents.max, { message: MSG.depositAmountCents.max })
  depositAmountCents?: number | null;

  /** Alias for depositAmountCents (minor currency units, consistent with pricing module). */
  @IsOptional()
  @ValidateIf((_o, value) => isRentalRuleSetValue(value))
  @IsInt({ message: MSG.depositAmount.int })
  @Min(L.depositAmountCents.min, { message: MSG.depositAmount.min })
  @Max(L.depositAmountCents.max, { message: MSG.depositAmount.max })
  depositAmount?: number | null;

  @IsOptional()
  @ValidateIf((_o, value) => isRentalRuleSetValue(value))
  @Transform(trimString)
  @IsString()
  @MinLength(L.depositCurrency.length, { message: MSG.depositCurrency.length })
  @MaxLength(L.depositCurrency.length, { message: MSG.depositCurrency.length })
  @IsIso4217Currency(MSG.depositCurrency.iso4217)
  depositCurrency?: string | null;

  @IsOptional()
  @ValidateIf((_o, value) => isRentalRuleSetValue(value))
  @IsBoolean({ message: MSG.boolean.invalid })
  creditCardRequired?: boolean | null;

  @IsOptional()
  @ValidateIf((_o, value) => isRentalRuleSetValue(value))
  @IsEnum(RentalForeignTravelPolicy, { message: MSG.enum.invalid })
  foreignTravelPolicy?: RentalForeignTravelPolicy | null;

  @IsOptional()
  @ValidateIf((_o, value) => isRentalRuleSetValue(value))
  @IsEnum(RentalAdditionalDriverPolicy, { message: MSG.enum.invalid })
  additionalDriverPolicy?: RentalAdditionalDriverPolicy | null;

  @IsOptional()
  @ValidateIf((_o, value) => isRentalRuleSetValue(value))
  @IsEnum(RentalYoungDriverPolicy, { message: MSG.enum.invalid })
  youngDriverPolicy?: RentalYoungDriverPolicy | null;

  @IsOptional()
  @ValidateIf((_o, value) => isRentalRuleSetValue(value))
  @Transform(trimString)
  @IsString()
  @MaxLength(L.insuranceRequirement.maxLength, { message: MSG.insuranceRequirement.maxLength })
  insuranceRequirement?: string | null;

  @IsOptional()
  @ValidateIf((_o, value) => isRentalRuleSetValue(value))
  @IsBoolean({ message: MSG.boolean.invalid })
  manualApprovalRequired?: boolean | null;

  @IsOptional()
  @ValidateIf((_o, value) => isRentalRuleSetValue(value))
  @Transform(trimString)
  @IsString()
  @MaxLength(L.notes.maxLength, { message: MSG.notes.maxLength })
  notes?: string | null;
}

export class UpsertOrganizationRentalRulesDto extends RentalRuleFieldsDto {
  @IsInt({ message: MSG.expectedVersion.int })
  @Min(0, { message: MSG.expectedVersion.min })
  expectedVersion!: number;

  @IsOptional()
  @IsBoolean({ message: MSG.boolean.invalid })
  isActive?: boolean;
}

export class CreateRentalVehicleCategoryDto extends RentalRuleFieldsDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: MSG.categoryName.required })
  @MinLength(L.categoryName.minLength, { message: MSG.categoryName.required })
  @MaxLength(L.categoryName.maxLength, { message: MSG.categoryName.maxLength })
  name!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(L.categoryDescription.maxLength, { message: MSG.categoryDescription.maxLength })
  description?: string;

  @IsOptional()
  @IsEnum(RentalVehicleCategoryType, { message: MSG.enum.invalid })
  type?: RentalVehicleCategoryType;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(L.categoryColor.maxLength, { message: MSG.categoryColor.maxLength })
  color?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(L.categoryIcon.maxLength, { message: MSG.categoryIcon.maxLength })
  icon?: string;

  @IsOptional()
  @IsBoolean({ message: MSG.boolean.invalid })
  isActive?: boolean;

  @IsOptional()
  @IsEnum(RentalVehicleCategoryStatus, { message: MSG.enum.invalid })
  status?: RentalVehicleCategoryStatus;
}

export class UpdateRentalVehicleCategoryDto extends RentalRuleFieldsDto {
  @IsInt({ message: MSG.expectedVersion.int })
  @Min(0, { message: MSG.expectedVersion.min })
  expectedVersion!: number;

  @IsOptional()
  @ValidateIf((_o, value) => isRentalRuleSetValue(value))
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: MSG.categoryName.required })
  @MinLength(L.categoryName.minLength, { message: MSG.categoryName.required })
  @MaxLength(L.categoryName.maxLength, { message: MSG.categoryName.maxLength })
  name?: string;

  @IsOptional()
  @ValidateIf((_o, value) => isRentalRuleSetValue(value))
  @Transform(trimString)
  @IsString()
  @MaxLength(L.categoryDescription.maxLength, { message: MSG.categoryDescription.maxLength })
  description?: string;

  @IsOptional()
  @ValidateIf((_o, value) => isRentalRuleSetValue(value))
  @IsEnum(RentalVehicleCategoryType, { message: MSG.enum.invalid })
  type?: RentalVehicleCategoryType;

  @IsOptional()
  @ValidateIf((_o, value) => isRentalRuleSetValue(value))
  @Transform(trimString)
  @IsString()
  @MaxLength(L.categoryColor.maxLength, { message: MSG.categoryColor.maxLength })
  color?: string;

  @IsOptional()
  @ValidateIf((_o, value) => isRentalRuleSetValue(value))
  @Transform(trimString)
  @IsString()
  @MaxLength(L.categoryIcon.maxLength, { message: MSG.categoryIcon.maxLength })
  icon?: string;

  @IsOptional()
  @IsBoolean({ message: MSG.boolean.invalid })
  isActive?: boolean;
}

export class TransitionCategoryLifecycleDto {
  @IsInt({ message: MSG.expectedVersion.int })
  @Min(0, { message: MSG.expectedVersion.min })
  expectedVersion!: number;

  @IsEnum(RentalVehicleCategoryStatus, { message: MSG.enum.invalid })
  targetStatus!: RentalVehicleCategoryStatus;
}

export class CategoryVehicleMoveDto {
  @IsUUID('4', { message: MSG.vehicleIds.uuid })
  @IsNotEmpty({ message: MSG.vehicleIds.notEmpty })
  vehicleId!: string;

  @IsUUID('4', { message: MSG.vehicleIds.uuid })
  @IsNotEmpty({ message: MSG.vehicleIds.notEmpty })
  fromCategoryId!: string;
}

class CategoryAssignmentDeltaFieldsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(L.vehicleAssignmentIds.maxCount, { message: MSG.vehicleIds.maxSize })
  @ArrayUnique({ message: MSG.vehicleIds.unique })
  @IsUUID('4', { each: true, message: MSG.vehicleIds.uuid })
  @IsNotEmpty({ each: true, message: MSG.vehicleIds.notEmpty })
  vehiclesToAdd?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(L.vehicleAssignmentIds.maxCount, { message: MSG.vehicleIds.maxSize })
  @ArrayUnique({ message: MSG.vehicleIds.unique })
  @IsUUID('4', { each: true, message: MSG.vehicleIds.uuid })
  @IsNotEmpty({ each: true, message: MSG.vehicleIds.notEmpty })
  vehiclesToRemove?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(L.vehicleAssignmentIds.maxCount, { message: MSG.vehicleIds.maxSize })
  @ValidateNested({ each: true })
  @Type(() => CategoryVehicleMoveDto)
  vehiclesToMove?: CategoryVehicleMoveDto[];
}

export class AssignCategoryVehiclesDto extends CategoryAssignmentDeltaFieldsDto {
  @IsInt({ message: MSG.expectedVersion.int })
  @Min(0, { message: MSG.expectedVersion.min })
  expectedVersion!: number;
}

export class PreviewCategoryVehicleAssignmentDto extends CategoryAssignmentDeltaFieldsDto {}

export class UpsertVehicleRentalOverridesDto extends RentalRuleFieldsDto {
  @IsInt({ message: MSG.expectedVersion.int })
  @Min(0, { message: MSG.expectedVersion.min })
  expectedVersion!: number;
}

export const RENTAL_RULE_RESET_FIELD_ALLOWLIST = [...RENTAL_RULE_FIELD_KEYS];

export class ResetVehicleRentalOverridesDto {
  @IsOptional()
  @IsInt({ message: MSG.expectedVersion.int })
  @Min(0, { message: MSG.expectedVersion.min })
  expectedVersion?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(L.resetOverrideFields.maxCount, { message: MSG.resetFields.maxSize })
  @IsString({ each: true })
  @IsNotEmpty({ each: true, message: MSG.resetFields.invalid })
  @IsIn(RENTAL_RULE_RESET_FIELD_ALLOWLIST, { each: true, message: MSG.resetFields.invalid })
  fields?: string[];
}

export class PublishRentalRuleRevisionDto {
  @IsUUID()
  revisionId!: string;

  @IsInt({ message: MSG.expectedVersion.int })
  @Min(0, { message: MSG.expectedVersion.min })
  expectedVersion!: number;

  @IsInt({ message: MSG.expectedVersion.int })
  @Min(1, { message: MSG.expectedVersion.min })
  expectedLockVersion!: number;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'rentalRules.validation.changeReason.required' })
  @MaxLength(500)
  changeReason!: string;

  @IsOptional()
  @IsBoolean({ message: MSG.boolean.invalid })
  acknowledgeCriticalImpact?: boolean;
}

export class AnalyzeRentalRulePublishDto {
  @IsUUID()
  revisionId!: string;
}

export const RENTAL_RULE_REVISION_PREVIEW_MODES = ['active', 'draft', 'diff'] as const;
export type RentalRuleRevisionPreviewModeDto =
  (typeof RENTAL_RULE_REVISION_PREVIEW_MODES)[number];

export class PreviewRentalRuleRevisionDto {
  @IsIn(RENTAL_RULE_REVISION_PREVIEW_MODES)
  mode!: RentalRuleRevisionPreviewModeDto;
}
