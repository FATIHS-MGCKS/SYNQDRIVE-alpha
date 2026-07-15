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

  @IsOptional()
  @IsIn(['VOLUME', 'GRADUATED'])
  tierMode?: 'VOLUME' | 'GRADUATED';
}

export class SimulatePriceVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  vehicleCount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountPercentBps?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  taxRateBps?: number;
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

export class CreateSetupIntentDto {
  @IsOptional()
  @IsIn(['card', 'sepa_debit'])
  paymentMethodType?: 'card' | 'sepa_debit';
}

export class StripeCustomerPortalDto {
  @IsOptional()
  @IsString()
  returnUrl?: string;
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

export class RecordManualPaymentDto {
  @IsString()
  @MinLength(1)
  orgId!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsOptional()
  @IsIn(['EUR', 'eur'])
  currency?: string;

  @IsIn(['BANK_TRANSFER', 'CASH', 'CHECK', 'OTHER'])
  paymentType!: 'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'OTHER';

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  receiptNote?: string;
}

export class RunBillingReconciliationDto {
  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsString()
  runId?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  batchSize?: number;
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
