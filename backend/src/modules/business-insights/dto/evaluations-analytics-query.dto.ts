import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import type { EvaluationsAnalyticsPeriod } from '@synq/evaluations-insights/evaluations-analytics-summary.contract';

export class EvaluationsAnalyticsSummaryQueryDto {
  @IsOptional()
  @IsUUID()
  stationId?: string;

  @IsOptional()
  @IsEnum(['mtd', 'last7d', 'last30d'])
  period?: EvaluationsAnalyticsPeriod;
}
