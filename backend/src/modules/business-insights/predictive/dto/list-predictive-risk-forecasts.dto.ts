import { ApiPropertyOptional } from '@nestjs/swagger';
import { PredictiveRiskTarget } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { RISK_FORECAST_HORIZONS_DAYS } from '@synq/evaluations-insights/predictive/evaluations-maintenance-risk.contract';

export class ListPredictiveRiskForecastsDto {
  @ApiPropertyOptional({ enum: PredictiveRiskTarget })
  @IsOptional()
  @IsEnum(PredictiveRiskTarget)
  riskKey?: PredictiveRiskTarget;

  @ApiPropertyOptional({ enum: [30, 90] })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([...RISK_FORECAST_HORIZONS_DAYS])
  horizonDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  asOfDate?: string;

  @ApiPropertyOptional({ default: 'fleet' })
  @IsOptional()
  @IsString()
  scopeKey?: string;
}

export class RunPredictiveRiskForecastsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  asOfDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ enum: [30, 90], isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsIn([...RISK_FORECAST_HORIZONS_DAYS], { each: true })
  horizons?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trigger?: string;
}
