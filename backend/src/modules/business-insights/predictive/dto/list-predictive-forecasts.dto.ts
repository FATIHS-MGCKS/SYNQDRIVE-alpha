import { ApiPropertyOptional } from '@nestjs/swagger';
import { PredictiveForecastTarget } from '@prisma/client';
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
import { FORECAST_HORIZONS_DAYS } from '@synq/evaluations-insights/predictive/evaluations-forecast.contract';

export class ListPredictiveForecastsDto {
  @ApiPropertyOptional({ enum: PredictiveForecastTarget })
  @IsOptional()
  @IsEnum(PredictiveForecastTarget)
  forecastKey?: PredictiveForecastTarget;

  @ApiPropertyOptional({ enum: [7, 30, 60, 90] })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([...FORECAST_HORIZONS_DAYS])
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

export class RunPredictiveForecastsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  asOfDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ enum: PredictiveForecastTarget, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsEnum(PredictiveForecastTarget, { each: true })
  targets?: PredictiveForecastTarget[];

  @ApiPropertyOptional({ enum: [7, 30, 60, 90], isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn([...FORECAST_HORIZONS_DAYS], { each: true })
  horizons?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trigger?: string;
}
