import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type {
  InsightAnalyticsCategory,
  InsightAnalyticsSeverity,
  InsightAnalyticsSortField,
  InsightAnalyticsSortOrder,
} from '@synq/evaluations-insights/insights-analytics.contract';

export class InsightAnalyticsListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(['BUSINESS_RISK', 'REVENUE_LEAKAGE', 'OPERATIONAL_RECOMMENDATION'])
  category?: InsightAnalyticsCategory;

  @IsOptional()
  @IsEnum(['CRITICAL', 'WARNING', 'OPPORTUNITY', 'INFO'])
  severity?: InsightAnalyticsSeverity;

  @IsOptional()
  @IsUUID()
  stationId?: string;

  @IsOptional()
  @IsEnum(['priority', 'createdAt'])
  sortBy?: InsightAnalyticsSortField;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: InsightAnalyticsSortOrder;
}

export class InsightAnalyticsSummaryQueryDto {
  @IsOptional()
  @IsEnum(['BUSINESS_RISK', 'REVENUE_LEAKAGE', 'OPERATIONAL_RECOMMENDATION'])
  category?: InsightAnalyticsCategory;

  @IsOptional()
  @IsEnum(['CRITICAL', 'WARNING', 'OPPORTUNITY', 'INFO'])
  severity?: InsightAnalyticsSeverity;

  @IsOptional()
  @IsUUID()
  stationId?: string;
}
