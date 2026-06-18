import {
  DamageEvidenceStatus,
  DamageLiabilityStatus,
  DamageLocationView,
  DamageRentalImpact,
  DamageSeverity,
  DamageSource,
  DamageStatus,
  DamageType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const DAMAGE_TYPES = Object.values(DamageType);
const DAMAGE_SEVERITIES = Object.values(DamageSeverity);
const DAMAGE_LOCATION_VIEWS = Object.values(DamageLocationView);
const DAMAGE_SOURCES = Object.values(DamageSource);
const DAMAGE_RENTAL_IMPACTS = Object.values(DamageRentalImpact);
const DAMAGE_EVIDENCE_STATUSES = Object.values(DamageEvidenceStatus);
const DAMAGE_LIABILITY_STATUSES = Object.values(DamageLiabilityStatus);

const DESCRIPTION_MAX = 4000;
const LABEL_MAX = 200;
const REPORTED_BY_MAX = 200;
const COST_MAX = 100_000_000;
const COORD_MAX = 100;

export class DamageImageInputDto {
  @IsString()
  imageData!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;
}

export class CreateDamageDto {
  @IsEnum(DamageType, { message: `damageType must be one of: ${DAMAGE_TYPES.join(', ')}` })
  damageType!: DamageType;

  @IsOptional()
  @IsEnum(DamageSeverity, { message: `severity must be one of: ${DAMAGE_SEVERITIES.join(', ')}` })
  severity?: DamageSeverity;

  @IsOptional()
  @IsEnum(DamageStatus)
  status?: DamageStatus;

  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX)
  description?: string;

  @IsOptional()
  @IsEnum(DamageLocationView)
  locationView?: DamageLocationView;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(COORD_MAX)
  locationX?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(COORD_MAX)
  locationY?: number;

  @IsOptional()
  @IsString()
  @MaxLength(LABEL_MAX)
  locationLabel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(COST_MAX)
  estimatedCostCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(COST_MAX)
  repairCostCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(COST_MAX)
  chargedToCustomerCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(COST_MAX)
  depositHoldCents?: number;

  @IsOptional()
  @IsEnum(DamageSource)
  source?: DamageSource;

  @IsOptional()
  @IsEnum(DamageRentalImpact)
  rentalImpact?: DamageRentalImpact;

  @IsOptional()
  @IsEnum(DamageEvidenceStatus)
  evidenceStatus?: DamageEvidenceStatus;

  @IsOptional()
  @IsEnum(DamageLiabilityStatus)
  liabilityStatus?: DamageLiabilityStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  liabilityNote?: string;

  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  handoverProtocolId?: string;

  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(REPORTED_BY_MAX)
  reportedBy?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => DamageImageInputDto)
  images?: DamageImageInputDto[];
}
