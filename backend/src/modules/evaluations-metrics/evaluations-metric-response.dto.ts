import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  EVALUATIONS_METRIC_COMPARISON_TYPES,
  EVALUATIONS_METRIC_STATUSES,
} from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import { EVALUATIONS_METRIC_UNITS } from '@synq/evaluations-metrics/evaluations-metric.contract';
import { EVALUATIONS_PERIOD_PRESETS } from '@synq/evaluations-periods/evaluations-period.contract';

class EvaluationsMetricPeriodRefDto {
  @IsIn([...EVALUATIONS_PERIOD_PRESETS, 'snapshot'])
  preset!: string;

  @IsISO8601()
  periodStart!: string;

  @IsISO8601()
  periodEndInclusive!: string;

  @IsString()
  timezone!: string;
}

class EvaluationsMetricComparisonDto {
  @IsIn([...EVALUATIONS_METRIC_COMPARISON_TYPES])
  type!: string;

  @IsOptional()
  priorValue!: number | null;

  @IsOptional()
  deltaAbs!: number | null;

  @IsOptional()
  deltaPct!: number | null;

  @IsIn([...EVALUATIONS_METRIC_STATUSES])
  status!: string;
}

class EvaluationsMetricDataCoverageDto {
  @IsOptional()
  @IsNumber()
  ratio!: number | null;

  @IsOptional()
  @IsNumber()
  rowsObserved!: number | null;

  @IsOptional()
  @IsNumber()
  rowsExpected!: number | null;

  @IsArray()
  @IsString({ each: true })
  missingSources!: string[];
}

class EvaluationsMetricSourceFreshnessDto {
  @IsOptional()
  @IsISO8601()
  latestSourceAt!: string | null;

  @IsOptional()
  @IsNumber()
  staleAfterMs!: number | null;

  @IsBoolean()
  isStale!: boolean;

  @IsOptional()
  @IsString()
  reason!: string | null;
}

export class EvaluationsMetricResponseDto {
  @IsString()
  metricId!: string;

  value!: number | string | boolean | null;

  @IsIn([...EVALUATIONS_METRIC_UNITS])
  unit!: string;

  @IsOptional()
  @IsString()
  currency!: string | null;

  @IsIn([...EVALUATIONS_METRIC_STATUSES])
  status!: string;

  @IsISO8601()
  generatedAt!: string;

  @ValidateNested()
  @Type(() => EvaluationsMetricPeriodRefDto)
  period!: EvaluationsMetricPeriodRefDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EvaluationsMetricComparisonDto)
  comparison!: EvaluationsMetricComparisonDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => EvaluationsMetricDataCoverageDto)
  dataCoverage!: EvaluationsMetricDataCoverageDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => EvaluationsMetricSourceFreshnessDto)
  sourceFreshness!: EvaluationsMetricSourceFreshnessDto | null;

  @IsString()
  calculationVersion!: string;

  @IsArray()
  @IsString({ each: true })
  exclusions!: string[];

  @IsArray()
  @IsString({ each: true })
  warnings!: string[];
}
