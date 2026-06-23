import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePriceBookDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  productKey!: string;

  @IsOptional()
  @IsIn(['EUR'])
  currency?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class CreatePriceVersionDto {
  @IsOptional()
  @IsString()
  versionLabel?: string;
}

export class PriceTierDto {
  @IsInt()
  @Min(1)
  minVehicles!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxVehicles?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  unitPriceCents?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class ReplaceTiersDto {
  @ValidateNested({ each: true })
  @Type(() => PriceTierDto)
  @ArrayMinSize(1)
  tiers!: PriceTierDto[];
}

export class PatchPriceVersionDto {
  @IsOptional()
  @IsString()
  versionLabel?: string;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;
}

export class PublishPriceVersionDto {
  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsBoolean()
  allowUnpriced?: boolean;
}

export class CreateSubscriptionDto {
  @IsString()
  @MinLength(1)
  orgId!: string;

  @IsString()
  @MinLength(1)
  stripeCustomerId!: string;

  @IsString()
  @MinLength(1)
  stripeSubscriptionId!: string;
}

export class AdminInvoiceQueryDto {
  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE'])
  status?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class AuditLogQueryDto {
  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
