import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import type {
  EvaluationsAnalyticsFiltersQuery,
  EvaluationsBookingStatus,
  EvaluationsComparisonMode,
  EvaluationsCustomerSegment,
  EvaluationsDataQualityStatus,
  EvaluationsVehicleStatus,
} from '@synq/evaluations-insights/evaluations-analytics-filters.contract';
import type { EvaluationsAnalyticsPeriod } from '@synq/evaluations-insights/evaluations-analytics-summary.contract';
import type {
  InsightAnalyticsCategory,
  InsightAnalyticsSeverity,
  InsightAnalyticsSortField,
  InsightAnalyticsSortOrder,
} from '@synq/evaluations-insights/insights-analytics.contract';

/** Canonical analytics filter query — shared across summary, insights, charts, drill-downs. */
export class EvaluationsAnalyticsFiltersQueryDto implements EvaluationsAnalyticsFiltersQuery {
  @IsOptional()
  @IsEnum(['mtd', 'last7d', 'last30d', 'custom'])
  period?: EvaluationsAnalyticsPeriod | 'custom';

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(['auto', 'previous', 'none'])
  comparison?: EvaluationsComparisonMode;

  @IsOptional()
  @IsUUID()
  stationId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  vehicleClassId?: string;

  @IsOptional()
  @IsEnum(['AVAILABLE', 'RENTED', 'IN_SERVICE', 'OUT_OF_SERVICE', 'RESERVED'])
  vehicleStatus?: EvaluationsVehicleStatus;

  @IsOptional()
  @IsString()
  bookingChannel?: string;

  @IsOptional()
  @IsEnum(['PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
  bookingStatus?: EvaluationsBookingStatus;

  @IsOptional()
  @IsEnum(['INDIVIDUAL', 'CORPORATE'])
  customerSegment?: EvaluationsCustomerSegment;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(['BUSINESS_RISK', 'REVENUE_LEAKAGE', 'OPERATIONAL_RECOMMENDATION'])
  riskCategory?: InsightAnalyticsCategory;

  @IsOptional()
  @IsEnum(['CRITICAL', 'WARNING', 'OPPORTUNITY', 'INFO'])
  insightStatus?: InsightAnalyticsSeverity;

  /** @deprecated Use insightStatus — kept for backward compatibility. */
  @IsOptional()
  @IsEnum(['CRITICAL', 'WARNING', 'OPPORTUNITY', 'INFO'])
  severity?: InsightAnalyticsSeverity;

  /** @deprecated Use riskCategory — kept for backward compatibility. */
  @IsOptional()
  @IsEnum(['BUSINESS_RISK', 'REVENUE_LEAKAGE', 'OPERATIONAL_RECOMMENDATION'])
  category?: InsightAnalyticsCategory;

  @IsOptional()
  @IsEnum(['OK', 'PARTIAL', 'STALE', 'UNAVAILABLE'])
  dataQualityStatus?: EvaluationsDataQualityStatus;
}

export class EvaluationsAnalyticsSummaryQueryDto extends EvaluationsAnalyticsFiltersQueryDto {}

export class EvaluationsInsightAnalyticsListQueryDto extends EvaluationsAnalyticsFiltersQueryDto {
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
  @IsEnum(['priority', 'createdAt'])
  sortBy?: InsightAnalyticsSortField;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: InsightAnalyticsSortOrder;
}

export class EvaluationsInsightAnalyticsSummaryQueryDto extends EvaluationsAnalyticsFiltersQueryDto {}

/** Normalize legacy alias fields into canonical filter names. */
export function normalizeAnalyticsFilterQuery(
  query: EvaluationsAnalyticsFiltersQueryDto,
): EvaluationsAnalyticsFiltersQuery {
  return {
    period: query.period,
    from: query.from,
    to: query.to,
    comparison: query.comparison,
    stationId: query.stationId ?? null,
    vehicleId: query.vehicleId ?? null,
    vehicleClassId: query.vehicleClassId ?? null,
    vehicleStatus: query.vehicleStatus ?? null,
    bookingChannel: query.bookingChannel ?? null,
    bookingStatus: query.bookingStatus ?? null,
    customerSegment: query.customerSegment ?? null,
    currency: query.currency ?? null,
    riskCategory: query.riskCategory ?? query.category ?? null,
    insightStatus: query.insightStatus ?? query.severity ?? null,
    dataQualityStatus: query.dataQualityStatus ?? null,
  };
}
