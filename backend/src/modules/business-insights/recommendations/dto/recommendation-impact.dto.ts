import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ImpactMoneyDto {
  @IsNumber()
  amountMinor!: number;

  @IsString()
  currency!: string;
}

class ImpactPeriodDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

export class MeasureRecommendationImpactDto {
  @IsOptional()
  @IsString()
  baselineKpiKey?: string;

  @IsOptional()
  @IsString()
  baselineKpiLabel?: string;

  @IsOptional()
  @IsNumber()
  baselineValue?: number | null;

  @IsOptional()
  @IsNumber()
  targetValue?: number | null;

  @IsOptional()
  @IsNumber()
  actualKpiValue?: number | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ImpactMoneyDto)
  expectedBenefit?: ImpactMoneyDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ImpactMoneyDto)
  expectedCost?: ImpactMoneyDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ImpactMoneyDto)
  actualCost?: ImpactMoneyDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ImpactMoneyDto)
  actualBenefit?: ImpactMoneyDto | null;

  @ValidateNested()
  @Type(() => ImpactPeriodDto)
  baselinePeriod!: ImpactPeriodDto;

  @ValidateNested()
  @Type(() => ImpactPeriodDto)
  measurementPeriod!: ImpactPeriodDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  dataCoveragePercent?: number | null;

  @IsIn(['FULL', 'PARTIAL', 'CANCELLED', 'NOT_STARTED'])
  implementationStatus!: 'FULL' | 'PARTIAL' | 'CANCELLED' | 'NOT_STARTED';

  @IsOptional()
  @IsIn(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'TARGET_IS_BETTER'])
  kpiDirection?: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'TARGET_IS_BETTER';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  seasonalOrExternalFactors?: string[];

  @IsOptional()
  @IsIn(['de', 'en'])
  locale?: 'de' | 'en';
}
