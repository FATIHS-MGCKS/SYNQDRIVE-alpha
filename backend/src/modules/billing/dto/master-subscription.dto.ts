import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MasterSubscriptionLockVersionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lockVersion?: number;
}

export class MasterSubscriptionDraftDto extends MasterSubscriptionLockVersionDto {
  @IsOptional()
  @IsIn(['EUR'])
  currency?: string;
}

export class MasterSubscriptionAssignPlanDto extends MasterSubscriptionLockVersionDto {
  @IsOptional()
  @IsString()
  priceBookId?: string;
}

export class MasterSubscriptionPriceVersionDto extends MasterSubscriptionLockVersionDto {
  @IsString()
  @MinLength(1)
  priceVersionId!: string;

  @IsOptional()
  @IsString()
  priceBookId?: string;
}

export class MasterSubscriptionTrialDto extends MasterSubscriptionPriceVersionDto {
  @IsISO8601()
  trialEndAt!: string;
}

export class MasterSubscriptionBillingAnchorDto extends MasterSubscriptionLockVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  anchorDay!: number;
}

export class MasterSubscriptionEffectiveAtDto extends MasterSubscriptionLockVersionDto {
  @IsISO8601()
  effectiveAt!: string;

  @IsOptional()
  @IsString()
  priceVersionId?: string;

  @IsOptional()
  @IsIn(['RENTAL', 'FLEET'])
  productKey?: 'RENTAL' | 'FLEET';
}

export class MasterSubscriptionPreviewDto {
  @IsOptional()
  @IsIn(['RENTAL', 'FLEET'])
  productKey?: 'RENTAL' | 'FLEET';

  @IsOptional()
  @IsString()
  priceVersionId?: string;

  @IsOptional()
  @IsISO8601()
  effectiveAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  anchorDay?: number;
}

export class MasterSubscriptionActivateDto extends MasterSubscriptionPriceVersionDto {}

export class MasterSubscriptionCancelDto extends MasterSubscriptionLockVersionDto {
  @IsOptional()
  @IsISO8601()
  cancelAt?: string;
}

export class MasterSubscriptionImmediateCancelDto extends MasterSubscriptionLockVersionDto {
  @IsOptional()
  allowImmediateCancel?: boolean;
}

export class MasterSubscriptionAddDiscountDto extends MasterSubscriptionLockVersionDto {
  @IsIn(['PERCENTAGE', 'FIXED_AMOUNT'])
  discountType!: 'PERCENTAGE' | 'FIXED_AMOUNT';

  @ValidateIf((dto: MasterSubscriptionAddDiscountDto) => dto.discountType === 'PERCENTAGE')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  percentBps?: number;

  @ValidateIf((dto: MasterSubscriptionAddDiscountDto) => dto.discountType === 'FIXED_AMOUNT')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fixedAmountCents?: number;

  @ValidateIf((dto: MasterSubscriptionAddDiscountDto) => dto.discountType === 'FIXED_AMOUNT')
  @IsIn(['EUR'])
  currency?: string;

  @IsISO8601()
  validFrom!: string;

  @IsOptional()
  @IsISO8601()
  validTo?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  subscriptionItemId?: string;
}

export class MasterSubscriptionUpdateDiscountDto extends MasterSubscriptionLockVersionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  percentBps?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fixedAmountCents?: number;

  @IsOptional()
  @IsISO8601()
  validTo?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class MasterSubscriptionEndDiscountDto extends MasterSubscriptionLockVersionDto {
  @IsOptional()
  @IsISO8601()
  validTo?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
