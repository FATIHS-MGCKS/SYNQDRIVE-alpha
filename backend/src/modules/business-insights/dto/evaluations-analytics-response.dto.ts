import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { EvaluationsAnalyticsSummaryResponse, EvaluationsStrengthDetectionResponse, EvaluationsWeaknessDetectionResponse } from '@synq/evaluations-insights/evaluations-analytics-summary.contract';
import type { InsightAnalyticsSummary } from '@synq/evaluations-insights/insights-analytics.contract';
import type { EvaluationsInsightDetail } from '@synq/evaluations-insights/evaluations-insight-detail.contract';

/** OpenAPI mirror of shared section envelope — see evaluations-analytics-primitives.contract.ts */
export class EvaluationsSectionEnvelopeDto {
  @ApiProperty({ enum: ['OK', 'PARTIAL', 'UNAVAILABLE', 'ERROR'] })
  status!: 'OK' | 'PARTIAL' | 'UNAVAILABLE' | 'ERROR';

  @ApiPropertyOptional({ type: Object })
  data!: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  error!: string | null;

  @ApiProperty()
  generatedAt!: string;
}

export class EvaluationsAnalyticsPeriodWindowDto {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  from!: string;

  @ApiProperty()
  to!: string;

  @ApiProperty()
  timezone!: string;
}

export class EvaluationsAnalyticsSummaryResponseDto implements EvaluationsAnalyticsSummaryResponse {
  @ApiProperty()
  organizationId!: string;

  @ApiProperty()
  generatedAt!: string;

  @ApiProperty({ type: EvaluationsAnalyticsPeriodWindowDto })
  period!: EvaluationsAnalyticsSummaryResponse['period'];

  @ApiProperty({ type: EvaluationsAnalyticsPeriodWindowDto })
  comparisonPeriod!: EvaluationsAnalyticsSummaryResponse['comparisonPeriod'];

  @ApiProperty({ type: Object })
  appliedFilters!: EvaluationsAnalyticsSummaryResponse['appliedFilters'];

  @ApiProperty({ enum: ['OK', 'PARTIAL', 'UNAVAILABLE', 'ERROR'] })
  overallStatus!: EvaluationsAnalyticsSummaryResponse['overallStatus'];

  @ApiProperty({ type: EvaluationsSectionEnvelopeDto })
  executive!: EvaluationsAnalyticsSummaryResponse['executive'];

  @ApiProperty({ type: EvaluationsSectionEnvelopeDto })
  financial!: EvaluationsAnalyticsSummaryResponse['financial'];

  @ApiProperty({ type: EvaluationsSectionEnvelopeDto })
  receivables!: EvaluationsAnalyticsSummaryResponse['receivables'];

  @ApiProperty({ type: EvaluationsSectionEnvelopeDto })
  bookings!: EvaluationsAnalyticsSummaryResponse['bookings'];

  @ApiProperty({ type: EvaluationsSectionEnvelopeDto })
  fleetUtilization!: EvaluationsAnalyticsSummaryResponse['fleetUtilization'];

  @ApiProperty({ type: EvaluationsSectionEnvelopeDto })
  vehicleAvailability!: EvaluationsAnalyticsSummaryResponse['vehicleAvailability'];

  @ApiProperty({ type: EvaluationsSectionEnvelopeDto })
  downtime!: EvaluationsAnalyticsSummaryResponse['downtime'];

  @ApiProperty({ type: EvaluationsSectionEnvelopeDto })
  costs!: EvaluationsAnalyticsSummaryResponse['costs'];

  @ApiProperty({ type: EvaluationsSectionEnvelopeDto })
  costModel!: EvaluationsAnalyticsSummaryResponse['costModel'];

  @ApiProperty({ type: EvaluationsSectionEnvelopeDto })
  utilizationModel!: EvaluationsAnalyticsSummaryResponse['utilizationModel'];

  @ApiProperty({ type: EvaluationsSectionEnvelopeDto })
  activeRisks!: EvaluationsAnalyticsSummaryResponse['activeRisks'];

  @ApiProperty({ type: EvaluationsSectionEnvelopeDto })
  affectedEntities!: EvaluationsAnalyticsSummaryResponse['affectedEntities'];

  @ApiProperty({ type: EvaluationsSectionEnvelopeDto })
  strengths!: EvaluationsAnalyticsSummaryResponse['strengths'];

  @ApiProperty({ type: EvaluationsSectionEnvelopeDto })
  weaknesses!: EvaluationsAnalyticsSummaryResponse['weaknesses'];

  @ApiProperty({ type: EvaluationsSectionEnvelopeDto })
  dataQuality!: EvaluationsAnalyticsSummaryResponse['dataQuality'];

  @ApiProperty({ type: EvaluationsSectionEnvelopeDto })
  insights!: EvaluationsAnalyticsSummaryResponse['insights'];

  @ApiProperty({ type: Object })
  metadata!: EvaluationsAnalyticsSummaryResponse['metadata'];
}

export class EvaluationsStrengthDetectionResponseDto implements EvaluationsStrengthDetectionResponse {
  @ApiProperty()
  organizationId!: string;

  @ApiProperty()
  generatedAt!: string;

  @ApiProperty({ type: EvaluationsAnalyticsPeriodWindowDto })
  period!: EvaluationsStrengthDetectionResponse['period'];

  @ApiProperty({ type: EvaluationsAnalyticsPeriodWindowDto })
  comparisonPeriod!: EvaluationsStrengthDetectionResponse['comparisonPeriod'];

  @ApiProperty({ type: Object })
  appliedFilters!: EvaluationsStrengthDetectionResponse['appliedFilters'];

  @ApiProperty({ type: EvaluationsSectionEnvelopeDto })
  strengths!: EvaluationsStrengthDetectionResponse['strengths'];
}

export class EvaluationsWeaknessDetectionResponseDto implements EvaluationsWeaknessDetectionResponse {
  @ApiProperty()
  organizationId!: string;

  @ApiProperty()
  generatedAt!: string;

  @ApiProperty({ type: EvaluationsAnalyticsPeriodWindowDto })
  period!: EvaluationsWeaknessDetectionResponse['period'];

  @ApiProperty({ type: EvaluationsAnalyticsPeriodWindowDto })
  comparisonPeriod!: EvaluationsWeaknessDetectionResponse['comparisonPeriod'];

  @ApiProperty({ type: Object })
  appliedFilters!: EvaluationsWeaknessDetectionResponse['appliedFilters'];

  @ApiProperty({ type: EvaluationsSectionEnvelopeDto })
  weaknesses!: EvaluationsWeaknessDetectionResponse['weaknesses'];
}

export class InsightAnalyticsSummaryResponseDto implements InsightAnalyticsSummary {
  @ApiProperty({ nullable: true })
  generatedAt!: string | null;

  @ApiProperty()
  hasRun!: boolean;

  @ApiProperty({ nullable: true })
  lastRunAt!: string | null;

  @ApiProperty()
  stale!: boolean;

  @ApiProperty({ nullable: true })
  error!: string | null;

  @ApiProperty({ type: Object })
  counts!: InsightAnalyticsSummary['counts'];

  @ApiProperty()
  estimatedFinancialExposureMinor!: number;

  @ApiProperty()
  estimatedFinancialExposureCurrency!: string;

  @ApiProperty({ type: Object })
  appliedFilters!: InsightAnalyticsSummary['appliedFilters'];
}

export class EvaluationsInsightDetailDto implements EvaluationsInsightDetail {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty()
  severity!: string;

  @ApiProperty()
  priority!: number;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty()
  entityScope!: string;

  @ApiProperty()
  isGrouped!: boolean;

  @ApiProperty()
  groupCount!: number;

  @ApiProperty()
  createdAt!: string;
}
