import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class ConnectStripeCatalogMappingDto {
  @IsIn(['TEST', 'LIVE'])
  stripeMode!: 'TEST' | 'LIVE';

  @IsString()
  @MinLength(1)
  stripeProductId!: string;

  @IsString()
  @MinLength(1)
  stripePriceId!: string;

  @IsOptional()
  @IsString()
  billingProductId?: string;

  @IsOptional()
  @IsIn(['EUR'])
  currency?: string;

  @IsOptional()
  @IsIn(['MONTHLY', 'YEARLY'])
  billingInterval?: 'MONTHLY' | 'YEARLY';
}
