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
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const DESCRIPTION_MAX = 4000;
const LABEL_MAX = 200;
const COST_MAX = 100_000_000;
const COORD_MAX = 100;

export class UpdateDamageDto {
  @IsOptional()
  @IsEnum(DamageType)
  damageType?: DamageType;

  @IsOptional()
  @IsEnum(DamageSeverity)
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
  liabilityNote?: string | null;

  @IsOptional()
  @IsUUID()
  bookingId?: string | null;

  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsUUID()
  handoverProtocolId?: string | null;

  @IsOptional()
  @IsUUID()
  taskId?: string | null;

  @IsOptional()
  @IsISO8601()
  repairStartedAt?: string | null;
}
