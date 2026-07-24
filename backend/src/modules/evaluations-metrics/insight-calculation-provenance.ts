import type { EvaluationsCalculationProvenance } from '@synq/evaluations-metrics/evaluations-calculation-provenance';
import {
  EVALUATIONS_CALCULATION_ENGINE_VERSION,
  EVALUATIONS_CALCULATION_PROVENANCE_SCHEMA_VERSION,
  buildCalculationProvenance,
} from '@synq/evaluations-metrics/evaluations-calculation-provenance';
import { EVALUATIONS_METRIC_REGISTRY_VERSION, requireEvaluationsMetricDefinition } from './evaluations-metric.registry';
import type { InsightCandidate, DetectorContext } from '../business-insights/insight.types';
import { InsightType } from '../business-insights/insight.types';

/** Maps InsightType → canonical evaluations metricId (registry). */
export const INSIGHT_TYPE_METRIC_ID: Readonly<Record<InsightType, string>> = {
  [InsightType.TIGHT_HANDOVER]: 'ins.tight_handover',
  [InsightType.RETURN_NEEDS_INSPECTION]: 'ins.return_needs_inspection',
  [InsightType.STATION_SHORTAGE]: 'ins.station_shortage',
  [InsightType.LOW_UTILIZATION]: 'ins.low_utilization',
  [InsightType.SERVICE_WINDOW]: 'ins.service_window',
  [InsightType.SERVICE_BEFORE_BOOKING]: 'ins.service_before_booking',
  [InsightType.BATTERY_CRITICAL]: 'ins.battery_critical_gated',
  [InsightType.TIRE_CRITICAL]: 'ins.tire_critical_gated',
  [InsightType.BRAKE_CRITICAL]: 'ins.brake_critical_gated',
  [InsightType.SERVICE_OVERDUE]: 'ins.service_overdue',
  [InsightType.PICKUP_OVERDUE]: 'ins.pickup_overdue',
  [InsightType.TUV_OVERDUE]: 'ins.tuv_overdue',
  [InsightType.BOKRAFT_OVERDUE]: 'ins.bokraft_overdue',
  [InsightType.HM_SERVICE_NO_TRACKING]: 'ins.hm_service_no_tracking',
  [InsightType.DRIVING_ASSESSMENT_DEVICE_QUALITY]: 'ins.driving_assessment_device_quality',
};

export const INSIGHT_DETECTOR_DATA_SOURCES: Readonly<Record<InsightType, readonly string[]>> = {
  [InsightType.TIGHT_HANDOVER]: ['bookings'],
  [InsightType.RETURN_NEEDS_INSPECTION]: ['bookings', 'handover_protocols'],
  [InsightType.STATION_SHORTAGE]: ['stations', 'vehicles', 'bookings'],
  [InsightType.LOW_UTILIZATION]: ['vehicles', 'bookings'],
  [InsightType.SERVICE_WINDOW]: ['vehicles', 'bookings', 'service_compliance'],
  [InsightType.SERVICE_BEFORE_BOOKING]: ['bookings', 'service_cases'],
  [InsightType.BATTERY_CRITICAL]: ['vehicles', 'battery_health', 'bookings'],
  [InsightType.TIRE_CRITICAL]: ['vehicles', 'tire_health', 'bookings'],
  [InsightType.BRAKE_CRITICAL]: ['vehicles', 'brake_health', 'bookings'],
  [InsightType.SERVICE_OVERDUE]: ['vehicles', 'service_compliance'],
  [InsightType.PICKUP_OVERDUE]: ['bookings', 'handover_protocols'],
  [InsightType.TUV_OVERDUE]: ['vehicles'],
  [InsightType.BOKRAFT_OVERDUE]: ['vehicles'],
  [InsightType.HM_SERVICE_NO_TRACKING]: ['vehicles'],
  [InsightType.DRIVING_ASSESSMENT_DEVICE_QUALITY]: ['vehicle_driving_assessment_quality'],
};

const MS_PER_DAY = 86_400_000;

export interface InsightRunProvenanceInput {
  organizationId: string;
  trigger: string;
  startedAt: Date;
  finishedAt: Date;
  policy: {
    enabledTypes: InsightType[];
    maxVisibleInsights: number;
    refreshIntervalMin: number;
  };
  detectorFailures: InsightType[];
  publishedMetricIds: string[];
  rankedCandidateCount: number;
}

export function resolveInsightPeriod(
  type: InsightType,
  ctx: DetectorContext,
  candidate: InsightCandidate,
): { periodStart: Date; periodEnd: Date } {
  const now = ctx.now;
  switch (type) {
    case InsightType.LOW_UTILIZATION: {
      const lookbackDays = ctx.policy.lowUtilizationDays;
      return {
        periodStart: new Date(now.getTime() - lookbackDays * MS_PER_DAY),
        periodEnd: new Date(now.getTime() + 7 * MS_PER_DAY),
      };
    }
    case InsightType.PICKUP_OVERDUE:
      return {
        periodStart: new Date(now.getTime() - 7 * MS_PER_DAY),
        periodEnd: now,
      };
    case InsightType.TIGHT_HANDOVER:
      return {
        periodStart: new Date(now.getTime() - 2 * MS_PER_DAY),
        periodEnd: new Date(now.getTime() + 2 * MS_PER_DAY),
      };
    case InsightType.STATION_SHORTAGE:
      return {
        periodStart: now,
        periodEnd: new Date(now.getTime() + MS_PER_DAY),
      };
    default:
      break;
  }

  const pickupAt = candidate.timeContext?.pickupAt;
  if (pickupAt) {
    const pickup = new Date(pickupAt);
    if (!Number.isNaN(pickup.getTime())) {
      return { periodStart: now, periodEnd: pickup };
    }
  }

  return { periodStart: now, periodEnd: now };
}

export function buildInsightCandidateProvenance(
  candidate: InsightCandidate,
  ctx: DetectorContext,
  generatedAt: Date,
): EvaluationsCalculationProvenance {
  const metricId = INSIGHT_TYPE_METRIC_ID[candidate.type];
  const definition = requireEvaluationsMetricDefinition(metricId);
  const { periodStart, periodEnd } = resolveInsightPeriod(candidate.type, ctx, candidate);

  return buildCalculationProvenance({
    metricId,
    calculationVersion: definition.calculationVersion,
    generatedAt,
    periodStart,
    periodEnd,
    appliedFilters: {
      organizationId: ctx.organizationId,
      insightType: candidate.type,
      dedupeKey: candidate.dedupeKey,
      entityScope: candidate.entityScope,
      entityIds: candidate.entityIds,
      policy: {
        handoverBufferMin: ctx.policy.handoverBufferMin,
        lowUtilizationDays: ctx.policy.lowUtilizationDays,
        stationShortageThreshold: ctx.policy.stationShortageThreshold,
        serviceWindowMinHours: ctx.policy.serviceWindowMinHours,
        serviceBeforeBookingHours: ctx.policy.serviceBeforeBookingHours,
      },
    },
    sourceVersions: {
      engineVersion: EVALUATIONS_CALCULATION_ENGINE_VERSION,
      registryVersion: EVALUATIONS_METRIC_REGISTRY_VERSION,
      detector: candidate.type,
      dataSources: INSIGHT_DETECTOR_DATA_SOURCES[candidate.type],
      schemaVersion: EVALUATIONS_CALCULATION_PROVENANCE_SCHEMA_VERSION,
    },
    completeness: 'complete',
  });
}

export function attachInsightCalculationProvenance(
  candidates: InsightCandidate[],
  ctx: DetectorContext,
  generatedAt: Date = ctx.now,
): InsightCandidate[] {
  return candidates.map((c) => ({
    ...c,
    calculationMeta: buildInsightCandidateProvenance(c, ctx, generatedAt),
  }));
}

export function buildInsightRunProvenance(input: InsightRunProvenanceInput): EvaluationsCalculationProvenance {
  const detectorVersions = Object.fromEntries(
    input.policy.enabledTypes.map((t) => {
      const metricId = INSIGHT_TYPE_METRIC_ID[t];
      const def = requireEvaluationsMetricDefinition(metricId);
      return [t, def.calculationVersion];
    }),
  );

  const completeness =
    input.detectorFailures.length > 0
      ? 'partial'
      : input.rankedCandidateCount > input.publishedMetricIds.length
        ? 'degraded'
        : 'complete';

  return buildCalculationProvenance({
    metricId: 'ins.business_risks_count',
    calculationVersion: requireEvaluationsMetricDefinition('ins.business_risks_count').calculationVersion,
    generatedAt: input.finishedAt,
    periodStart: input.startedAt,
    periodEnd: input.finishedAt,
    appliedFilters: {
      organizationId: input.organizationId,
      trigger: input.trigger,
      enabledTypes: input.policy.enabledTypes,
      maxVisibleInsights: input.policy.maxVisibleInsights,
      refreshIntervalMin: input.policy.refreshIntervalMin,
      publishedMetricIds: input.publishedMetricIds,
      failedDetectors: input.detectorFailures,
    },
    sourceVersions: {
      engineVersion: EVALUATIONS_CALCULATION_ENGINE_VERSION,
      registryVersion: EVALUATIONS_METRIC_REGISTRY_VERSION,
      detectorVersions,
      schemaVersion: EVALUATIONS_CALCULATION_PROVENANCE_SCHEMA_VERSION,
    },
    completeness,
  });
}
