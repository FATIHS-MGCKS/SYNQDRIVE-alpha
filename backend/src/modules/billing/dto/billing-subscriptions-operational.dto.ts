import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class BillingSubscriptionsOperationalQueryDto {
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

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  domainStatus?: string;

  @IsOptional()
  @IsIn(['ok', 'warning', 'critical'])
  billingHealth?: 'ok' | 'warning' | 'critical';

  @IsOptional()
  @IsIn(['ok', 'warning', 'critical'])
  reconciliationHealth?: 'ok' | 'warning' | 'critical';

  @IsOptional()
  @IsString()
  productKey?: string;

  @IsOptional()
  @IsIn(['active', 'expiring', 'none'])
  trialState?: 'active' | 'expiring' | 'none';

  @IsOptional()
  @IsIn(['yes', 'critical', 'warning'])
  attention?: 'yes' | 'critical' | 'warning';

  @IsOptional()
  @IsString()
  attentionCode?: string;

  @IsOptional()
  @IsIn(['attention', 'companyName', 'nextChargeAt', 'domainStatus'])
  sort?: 'attention' | 'companyName' | 'nextChargeAt' | 'domainStatus';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
